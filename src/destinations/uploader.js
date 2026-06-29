// Orchestrates a push of one account's data to one destination: streams record
// batches then media files, skipping anything already shipped, with retries and
// progress. Returns per-kind counts. Destination-agnostic.
import fs from 'node:fs';
import path from 'node:path';

import * as DB from '../db/index.js';
import { userDataDir } from '../paths.js';
import { makeDestination } from './index.js';
import { SCHEMA, ALL_KINDS, source, records, blobs, videoItems } from './serialize.js';

const BATCH = 200;
const nowS = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.json': 'application/json' };
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

async function retry(fn, label, onProgress, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      err = e;
      if (i < tries - 1) { onProgress?.({ type: 'warn', message: `${label} failed (${e.message}); retrying…` }); await sleep(500 * (i + 1)); }
    }
  }
  throw err;
}

// Diff / preview: what a push would send right now (not yet shipped), without
// uploading anything. Powers the Connect tab's "X new · Y MB pending".
export function pendingSummary(acc, dest) {
  const shipped = DB.shippedRefs(dest.id, acc.id);
  const sizeOf = (rel) => { try { return fs.statSync(path.join(userDataDir(), rel)).size; } catch { return 0; } };
  if (dest.config?.content === 'videos') {
    let videos = 0, bytes = 0;
    for (const it of videoItems(acc.id)) {
      if (shipped.has(`blob:${it.relVideo}`)) continue;
      const s = sizeOf(it.relVideo);
      if (s) { videos++; bytes += s; }
    }
    return { mode: 'videos', items: videos, bytes };
  }
  let recs = 0;
  for (const kind of ALL_KINDS) recs += records(acc.id, kind, shipped).length;
  let files = 0, bytes = 0;
  const seen = new Set();
  for (const kind of ALL_KINDS) for (const f of blobs(acc.id, kind, shipped)) {
    if (seen.has(f.ref)) continue; seen.add(f.ref);
    const s = sizeOf(f.relPath); if (s) { files++; bytes += s; }
  }
  return { mode: 'all', items: recs + files, records: recs, blobs: files, bytes };
}

export async function pushAccount(acc, dest, { kinds, full = false, onProgress } = {}) {
  const sink = makeDestination(dest);
  const src = source(acc);
  const pick = (kinds && kinds.length) ? kinds.filter((k) => ALL_KINDS.includes(k)) : ALL_KINDS;
  const wantMedia = sink.sendMedia !== false;

  if (full) DB.resetLedger(dest.id, acc.id);
  const shipped = DB.shippedRefs(dest.id, acc.id);

  const stats = {};
  const exported_at = nowS();
  const env = (kind, batch, recs) => ({ schema: SCHEMA, source: src, exported_at, kind, batch, count: recs.length, records: recs.map((r) => r.data) });

  // "Videos only": ship each video file with a self-describing JSON sidecar
  // (<file>.json) carrying that item's metadata, co-located for easy ingestion.
  if (dest.config?.content === 'videos') {
    let vids = 0, metas = 0, missing = 0, sentBytes = 0;
    const items = videoItems(acc.id);
    // Pending total (count + bytes) up front so the UI can draw a progress bar.
    let totalVids = 0, totalBytes = 0;
    for (const it of items) {
      if (shipped.has(`blob:${it.relVideo}`)) continue;
      try { totalBytes += fs.statSync(path.join(userDataDir(), it.relVideo)).size; totalVids++; } catch { /* missing */ }
    }
    onProgress?.({ type: 'progress', sent: 0, total: totalVids, bytes: 0, totalBytes, message: `0/${totalVids} videos` });
    for (const it of items) {
      const abs = path.join(userDataDir(), it.relVideo);
      if (!fs.existsSync(abs)) { missing++; continue; }
      const videoRef = `blob:${it.relVideo}`, metaRef = `meta:${it.relVideo}`;
      if (!shipped.has(videoRef)) {
        const buffer = fs.readFileSync(abs);
        await retry(() => sink.putBlob(src, { relPath: it.relVideo, buffer, contentType: mimeOf(it.relVideo) }), `video ${it.relVideo}`, onProgress);
        DB.recordShipped(dest.id, acc.id, [videoRef]); vids++; sentBytes += buffer.length;
        onProgress?.({ type: 'progress', sent: vids, total: totalVids, bytes: sentBytes, totalBytes, message: `${vids}/${totalVids} videos` });
      }
      if (!shipped.has(metaRef)) {
        const meta = Buffer.from(JSON.stringify({ schema: SCHEMA, source: src, exported_at, kind: it.kind, record: it.data }, null, 2));
        await retry(() => sink.putBlob(src, { relPath: `${it.relVideo}.json`, buffer: meta, contentType: 'application/json' }), `meta ${it.relVideo}`, onProgress);
        DB.recordShipped(dest.id, acc.id, [metaRef]); metas++;
      }
    }
    stats.videos = vids; stats.metadata = metas; stats.bytes = sentBytes;
    if (missing) stats.not_downloaded = missing;
    return stats;
  }

  // 1) records, kind by kind, in batches
  for (const kind of pick) {
    const recs = records(acc.id, kind, shipped);
    if (!recs.length) continue;
    let sent = 0;
    for (let i = 0; i < recs.length; i += BATCH) {
      const slice = recs.slice(i, i + BATCH);
      const batchNo = Math.floor(i / BATCH);
      await retry(() => sink.sendBatch(env(kind, batchNo, slice)), `send ${kind} #${batchNo}`, onProgress);
      DB.recordShipped(dest.id, acc.id, slice.map((r) => r.ref));
      sent += slice.length;
      onProgress?.({ type: 'progress', message: `${kind}: sent ${sent}/${recs.length}` });
    }
    stats[kind] = sent;
  }

  // 2) media files (if the destination accepts them)
  if (wantMedia) {
    let files = [];
    for (const kind of pick) files = files.concat(blobs(acc.id, kind, shipped));
    const seen = new Set();
    files = files.filter((f) => (seen.has(f.ref) ? false : seen.add(f.ref)));
    let done = 0, skipped = 0, sentBytes = 0;
    for (const f of files) {
      const abs = path.join(userDataDir(), f.relPath);
      if (!fs.existsSync(abs)) { skipped++; continue; }
      const buffer = fs.readFileSync(abs);
      await retry(() => sink.putBlob(src, { relPath: f.relPath, buffer, contentType: mimeOf(f.relPath) }), `blob ${f.relPath}`, onProgress);
      DB.recordShipped(dest.id, acc.id, [f.ref]);
      done++; sentBytes += buffer.length;
      onProgress?.({ type: 'progress', sent: done, total: files.length, bytes: sentBytes, message: `media: ${done}/${files.length}` });
    }
    stats.media_files = done; stats.bytes = (stats.bytes || 0) + sentBytes;
    if (skipped) stats.media_missing = skipped;
  }

  return stats;
}
