// IPC: manage remote destinations and push an account's data to one.
import { ipcMain } from 'electron';

import * as DB from '../db/index.js';
import { TYPES, makeDestination } from '../destinations/index.js';
import { detectDestination } from '../destinations/autodetect.js';
import { connectDrive } from '../destinations/google-oauth.js';
import { pushAccount, pendingSummary } from '../destinations/uploader.js';
import { emit } from '../windows.js';

const nowS = () => Math.floor(Date.now() / 1000);

// "auto" isn't a real backend — resolve the pasted link into a concrete one
// (azure/s3/webhook) so what we store and run is always explicit.
function resolve(payload) {
  if (payload.type !== 'auto') return payload;
  const { connection, ...extra } = payload.config || {};
  const det = detectDestination(connection, extra);
  return { id: payload.id, name: payload.name, enabled: payload.enabled, type: det.type, config: det.config };
}

export function registerDestinationIpc() {
  ipcMain.handle('destinations:types', () => TYPES);
  ipcMain.handle('destinations:list', () => DB.listDestinations());
  ipcMain.handle('destinations:save', (_e, payload) => {
    try { DB.saveDestination(resolve(payload)); return { ok: true }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('destinations:delete', (_e, { id }) => { DB.deleteDestination(id); return DB.listDestinations(); });

  // Interactive Google sign-in → returns a refresh token the form stores in config.
  ipcMain.handle('drive:connect', async (_e, { clientId, clientSecret } = {}) => {
    try { return { ok: true, ...(await connectDrive(clientId, clientSecret)) }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });

  ipcMain.handle('destinations:test', async (_e, { id, type, config } = {}) => {
    try {
      const dest = id ? DB.getDestination(id) : resolve({ type, config });
      const sink = makeDestination(dest);
      const r = await sink.test();
      return { ok: true, type: dest.type, ...r };
    } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });

  // Diff / preview: what's new since last push (count + bytes), no upload.
  ipcMain.handle('push:preview', (_e, { platform, accountId, destinationId } = {}) => {
    const acc = DB.resolveAcc(platform, accountId);
    const dest = DB.getDestination(destinationId);
    if (!acc || !dest) return null;
    try { return pendingSummary(acc, dest); } catch (err) { return { error: String(err.message || err) }; }
  });

  // Push history for the Connect tab.
  ipcMain.handle('push:history', (_e, { platform, accountId, destinationId } = {}) => {
    const acc = DB.resolveAcc(platform, accountId);
    if (!acc) return [];
    return DB.listPushRuns(destinationId, acc.id, 10);
  });

  ipcMain.handle('push:run', async (_e, { platform, accountId, destinationId, kinds, full } = {}) => {
    const acc = DB.resolveAcc(platform, accountId);
    const dest = DB.getDestination(destinationId);
    if (!acc) return { status: 'error', error: 'not connected' };
    if (!dest) return { status: 'error', error: 'destination not found' };
    if (!dest.enabled) return { status: 'error', error: 'destination is disabled' };

    const started = nowS();
    const onProgress = (p) => emit('push:progress', { destinationId, ...p });
    onProgress({ type: 'start', message: `Pushing to “${dest.name}”…` });
    try {
      const stats = await pushAccount(acc, dest, { kinds, full, onProgress });
      DB.markPush(dest.id, 'ok');
      const items = (stats.videos || 0) + (stats.media_files || 0) + Object.entries(stats).filter(([k]) => !['videos', 'metadata', 'bytes', 'media_files', 'not_downloaded', 'media_missing'].includes(k)).reduce((a, [, v]) => a + (Number(v) || 0), 0);
      DB.recordPushRun({ destination_id: dest.id, account_id: acc.id, started_at: started, finished_at: nowS(), status: 'ok', items, bytes: stats.bytes || 0, stats });
      const summary = Object.entries(stats).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nothing new';
      onProgress({ type: 'finished', message: `Pushed to “${dest.name}”: ${summary}`, stats });
      return { status: 'ok', stats };
    } catch (err) {
      DB.markPush(dest.id, 'error');
      DB.recordPushRun({ destination_id: dest.id, account_id: acc.id, started_at: started, finished_at: nowS(), status: 'error', items: 0, bytes: 0, stats: { error: String(err.message || err) } });
      onProgress({ type: 'error', message: `Push failed: ${String(err.message || err)}` });
      return { status: 'error', error: String(err.message || err) };
    }
  });
}
