// IPC: platforms list, account status/list, login (per-account session), disconnect.
import { ipcMain, BrowserWindow, session } from 'electron';

import * as DB from '../db/index.js';
import { getAdapter, listPlatforms } from '../platforms/index.js';
import { cookieMap } from '../sync/session-fetch.js';
import { buildCtx } from '../ctx.js';
import { tunedSession, tuneWindow, STEALTH_PRELOAD } from '../session-config.js';
import { emit, getMainWin } from '../windows.js';

const loginWindows = new Map(); // platform -> BrowserWindow (one login at a time)

// Allocate the next isolated session partition for a new account on this platform.
function nextPartition(platform) {
  const seq = parseInt(DB.getSetting('partitionSeq', '0'), 10) + 1;
  DB.setSetting('partitionSeq', String(seq));
  return `persist:${platform}:${seq}`;
}

export function registerAccountIpc() {
  ipcMain.handle('platforms:list', () => listPlatforms());

  ipcMain.handle('account:status', (_e, platform) => {
    const accounts = DB.getAccounts(platform);
    return { connected: accounts.length > 0, accounts };
  });

  ipcMain.handle('accounts:list', (_e, platform) => DB.getAccounts(platform));

  ipcMain.handle('login:start', async (_e, { platform, fresh } = {}) => {
    const adapter = getAdapter(platform);
    if (!adapter.enabled) throw new Error(`${adapter.label} not available yet`);
    if (loginWindows.get(platform)) { loginWindows.get(platform).focus(); return { status: 'pending' }; }

    // First-ever account keeps the legacy 'persist:<platform>' partition (back-compat);
    // every "Add account" (fresh) gets its own partition so sessions don't collide.
    const existing = DB.getAccounts(platform);
    const partition = (!fresh && existing.length === 0) ? `persist:${platform}` : nextPartition(platform);

    const win = new BrowserWindow({
      width: 520, height: 720, title: `Sign in — ${adapter.label}`, parent: getMainWin(),
      // contextIsolation:false + the stealth preload run our spoof in IG's own
      // world before its scripts (page can't reach node — nodeIntegration stays off).
      webPreferences: { session: tunedSession(partition), contextIsolation: false, sandbox: false, preload: STEALTH_PRELOAD },
    });
    tuneWindow(win);
    loginWindows.set(platform, win);

    return await new Promise((resolve) => {
      let settled = false;
      const finish = async (url) => {
        if (settled) return;
        const cookies = await cookieMap(partition, adapter.cookieDomain);
        if (!adapter.loginSuccess(url, cookies)) return;
        settled = true;
        try {
          const ctx = await buildCtx(adapter, { partition });
          ctx.cookies = cookies;
          const info = await adapter.resolveAccount(ctx);
          // If this account already exists, keep its partition (don't orphan it).
          const prior = DB.getAccountByUser(platform, info.user_id);
          const acc = DB.upsertAccount({ platform, ...info, partition: prior?.partition || partition });
          emit('account:connected', { platform, username: info.username, accountId: acc.id });
          resolve({ status: 'connected', username: info.username, accountId: acc.id });
        } catch (err) {
          resolve({ status: 'error', error: String(err) });
        } finally {
          if (!win.isDestroyed()) win.close();
        }
      };
      win.webContents.on('did-navigate', (_ev, url) => finish(url));
      win.webContents.on('did-navigate-in-page', (_ev, url) => finish(url));
      win.on('closed', () => { loginWindows.delete(platform); if (!settled) resolve({ status: 'cancelled' }); });
      win.loadURL(adapter.loginUrl);
    });
  });

  ipcMain.handle('account:disconnect', async (_e, { platform, accountId } = {}) => {
    const acc = accountId ? DB.getAccountById(accountId) : DB.getAccount(platform);
    if (!acc) return { status: 'empty' };
    if (acc.partition) await session.fromPartition(acc.partition).clearStorageData(); // clear only this account's cookies
    DB.deleteAccountById(acc.id); // CASCADE drops its media/saved/connections/cursors
    return { status: 'ok' };
  });
}
