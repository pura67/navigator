// IPC: manage remote destinations and push an account's data to one.
import { ipcMain } from 'electron';

import * as DB from '../db/index.js';
import { TYPES, makeDestination } from '../destinations/index.js';
import { pushAccount } from '../destinations/uploader.js';
import { emit } from '../windows.js';

export function registerDestinationIpc() {
  ipcMain.handle('destinations:types', () => TYPES);
  ipcMain.handle('destinations:list', () => DB.listDestinations());
  ipcMain.handle('destinations:save', (_e, payload) => { DB.saveDestination(payload); return DB.listDestinations(); });
  ipcMain.handle('destinations:delete', (_e, { id }) => { DB.deleteDestination(id); return DB.listDestinations(); });

  ipcMain.handle('destinations:test', async (_e, { id, type, config } = {}) => {
    try {
      const dest = id ? DB.getDestination(id) : { type, config };
      const sink = makeDestination(dest);
      const r = await sink.test();
      return { ok: true, ...r };
    } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });

  ipcMain.handle('push:run', async (_e, { platform, accountId, destinationId, kinds, full } = {}) => {
    const acc = DB.resolveAcc(platform, accountId);
    const dest = DB.getDestination(destinationId);
    if (!acc) return { status: 'error', error: 'not connected' };
    if (!dest) return { status: 'error', error: 'destination not found' };
    if (!dest.enabled) return { status: 'error', error: 'destination is disabled' };

    const onProgress = (p) => emit('push:progress', { destinationId, ...p });
    onProgress({ type: 'start', message: `Pushing to “${dest.name}”…` });
    try {
      const stats = await pushAccount(acc, dest, { kinds, full, onProgress });
      DB.markPush(dest.id, 'ok');
      const summary = Object.entries(stats).map(([k, v]) => `${v} ${k}`).join(' · ') || 'nothing new';
      onProgress({ type: 'finished', message: `Pushed to “${dest.name}”: ${summary}` });
      return { status: 'ok', stats };
    } catch (err) {
      DB.markPush(dest.id, 'error');
      onProgress({ type: 'error', message: `Push failed: ${String(err.message || err)}` });
      return { status: 'error', error: String(err.message || err) };
    }
  });
}
