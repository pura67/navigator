// Entry point: boot the DB, register IPC, open the window, manage lifecycle.
// Everything else lives in db/, ipc/, ctx.js, windows.js, platforms/, sync/.
import { app, BrowserWindow } from 'electron';

import { initDb } from './db/index.js';
import { registerIpc } from './ipc/index.js';
import { createMainWindow } from './windows.js';
import { closeApiWindows } from './sync/session-fetch.js';
import { userDataDir } from './paths.js';

app.whenReady().then(() => {
  initDb(userDataDir());
  registerIpc();
  createMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on('window-all-closed', () => { closeApiWindows(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => closeApiWindows());
