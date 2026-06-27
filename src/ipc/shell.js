// IPC: OS integrations (open folder/url/file) + JSON export + authed image fetch.
import { ipcMain, shell, dialog, app, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

import * as DB from '../db/index.js';
import { getMainWin } from '../windows.js';
import { tunedSession } from '../session-config.js';
import { dataDir, userDataDir } from '../paths.js';

export function registerShellIpc() {
  // Fetch a remote image (e.g. profile pic) through the account's logged-in
  // session and return a data: URL — sidesteps CSP/referrer/CORS and works even
  // when the CDN URL needs the IG session. Returns null on failure.
  ipcMain.handle('media:dataUrl', async (_e, { platform, accountId, url } = {}) => {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
    const acc = accountId ? DB.getAccountById(accountId) : DB.getAccount(platform);
    if (!acc?.partition) return null;
    try {
      const res = await net.fetch(url, { session: tunedSession(acc.partition), useSessionCookies: true });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { return null; }
  });

  ipcMain.handle('open:dataDir', () => shell.openPath(dataDir()));
  ipcMain.handle('open:url', (_e, url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url); });

  // Play/open a downloaded media file (relative path under userData) in the OS
  // default app. Returns '' on success, or an error string the renderer can show.
  ipcMain.handle('open:path', async (_e, rel) => {
    if (typeof rel !== 'string' || rel.includes('..')) return 'bad path';
    const abs = path.join(userDataDir(), rel);
    if (!fs.existsSync(abs)) return 'file not found on disk';
    return shell.openPath(abs);
  });

  ipcMain.handle('export:run', async (_e, { platform, accountId } = {}) => {
    const data = DB.exportAccount(platform, accountId);
    if (!data) return { status: 'empty' };
    const def = path.join(app.getPath('downloads'), `${platform}-${data.account.username || 'account'}.json`);
    const { canceled, filePath } = await dialog.showSaveDialog(getMainWin(), { defaultPath: def, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (canceled || !filePath) return { status: 'cancelled' };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return { status: 'ok', filePath };
  });
}
