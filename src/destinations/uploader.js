// Orchestrates a push of one account's data to one destination: streams record
// batches then media files, skipping anything already shipped, with retries and
// progress. Returns per-kind counts. Destination-agnostic.
import fs from 'node:fs';
import path from 'node:path';

import * as DB from '../db/index.js';
import { userDataDir } from '../paths.js';
import { makeDestination } from './index.js';
import { SCHEMA, ALL_KINDS, source, records, blobs } from './serialize.js';

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
    let done = 0, skipped = 0;
    for (const f of files) {
      const abs = path.join(userDataDir(), f.relPath);
      if (!fs.existsSync(abs)) { skipped++; continue; }
      const buffer = fs.readFileSync(abs);
      await retry(() => sink.putBlob(src, { relPath: f.relPath, buffer, contentType: mimeOf(f.relPath) }), `blob ${f.relPath}`, onProgress);
      DB.recordShipped(dest.id, acc.id, [f.ref]);
      done++;
      if (done % 10 === 0 || done === files.length) onProgress?.({ type: 'progress', message: `media: uploaded ${done}/${files.length}` });
    }
    stats.media_files = done;
    if (skipped) stats.media_missing = skipped;
  }

  return stats;
}
