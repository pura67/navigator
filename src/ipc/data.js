// IPC: read models for the renderer (summary + category listing).
import { ipcMain } from 'electron';
import * as DB from '../db/index.js';

export function registerDataIpc() {
  ipcMain.handle('data:summary', (_e, { platform, accountId } = {}) => DB.summary(platform, accountId));
  ipcMain.handle('data:list', (_e, { platform, category, accountId }) => DB.listItems(platform, category, accountId));
  ipcMain.handle('data:creators', (_e, { platform, accountId } = {}) => DB.listCreators(platform, accountId));
  ipcMain.handle('data:byCreator', (_e, { platform, accountId, username } = {}) => DB.listByCreator(platform, accountId, username));
}
