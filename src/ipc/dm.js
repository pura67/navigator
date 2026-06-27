// IPC: DM thread list (for the picker) + sync shared media from chosen threads.
import { ipcMain } from 'electron';

import * as DB from '../db/index.js';
import { getAdapter } from '../platforms/index.js';
import { buildCtx } from '../ctx.js';
import { emit } from '../windows.js';

export function registerDmIpc() {
  ipcMain.handle('dm:threads', async (_e, { platform, accountId } = {}) => {
    const adapter = getAdapter(platform);
    const account = accountId ? DB.getAccountById(accountId) : DB.getAccount(platform);
    if (!account) throw new Error('not connected — sign in first');
    if (!adapter.listDmThreads) return { status: 'unsupported', threads: [] };
    try {
      const ctx = await buildCtx(adapter, account);
      const threads = await adapter.listDmThreads(ctx);
      DB.saveDmThreads(account.id, threads);
      return { status: 'ok', threads };
    } catch (err) {
      return { status: 'error', error: String(err), threads: [] };
    }
  });

  ipcMain.handle('dm:sync', async (_e, { platform, accountId, threadIds } = {}) => {
    const adapter = getAdapter(platform);
    const account = accountId ? DB.getAccountById(accountId) : DB.getAccount(platform);
    if (!account) throw new Error('not connected — sign in first');
    if (!adapter.syncDmThreads || !threadIds?.length) return { status: 'empty' };
    const progress = (p) => emit('sync:progress', { platform, accountId: account.id, ...p });
    try {
      const ctx = await buildCtx(adapter, account);
      const count = await adapter.syncDmThreads(ctx, threadIds, progress);
      return { status: 'ok', count, summary: DB.summary(platform, account.id) };
    } catch (err) {
      progress({ type: 'error', message: String(err) });
      return { status: 'error', error: String(err) };
    }
  });
}
