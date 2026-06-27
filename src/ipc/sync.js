// IPC: run a sync for one account, streaming progress to the renderer.
import { ipcMain } from 'electron';

import * as DB from '../db/index.js';
import { getAdapter } from '../platforms/index.js';
import { buildCtx } from '../ctx.js';
import { emit } from '../windows.js';

const nowS = () => Math.floor(Date.now() / 1000);

export function registerSyncIpc() {
  ipcMain.handle('sync:start', async (_e, { platform, scope, accountId }) => {
    const adapter = getAdapter(platform);
    const account = accountId ? DB.getAccountById(accountId) : DB.getAccount(platform);
    if (!account) throw new Error('not connected — sign in first');

    const progress = (p) => emit('sync:progress', { platform, accountId: account.id, ...p });
    const started = nowS();
    progress({ type: 'start', message: `Starting ${adapter.label} sync: ${scope.join(', ')}` });

    const run = (status, stats) => DB.recordRun({
      account_id: account.id, platform, scope: scope.join(','),
      started_at: started, finished_at: nowS(), status, stats_json: JSON.stringify(stats),
    });

    try {
      const ctx = await buildCtx(adapter, account);
      await adapter.sync(ctx, scope, progress);
      // Refresh profile (pfp URL expires; keeps bio + counts/totals current for %).
      try { const info = await adapter.resolveAccount(ctx); DB.upsertAccount({ platform, ...info, partition: account.partition }); } catch { /* non-fatal */ }
      const summary = DB.summary(platform, account.id);
      run('ok', summary);
      progress({ type: 'finished', message: 'Done', summary });
      return { status: 'ok', summary };
    } catch (err) {
      run('error', { error: String(err) });
      progress({ type: 'error', message: String(err) });
      return { status: 'error', error: String(err) };
    }
  });
}
