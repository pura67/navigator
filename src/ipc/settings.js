// IPC: app settings get/set.
import { ipcMain } from 'electron';
import * as DB from '../db/index.js';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => DB.getSettings());
  ipcMain.handle('settings:set', (_e, { key, value }) => { DB.setSetting(key, value); return DB.getSettings(); });
}
