// Registers every IPC handler. Called once on app ready.
import { registerAccountIpc } from './accounts.js';
import { registerSyncIpc } from './sync.js';
import { registerDataIpc } from './data.js';
import { registerSettingsIpc } from './settings.js';
import { registerShellIpc } from './shell.js';
import { registerDmIpc } from './dm.js';

export function registerIpc() {
  registerAccountIpc();
  registerSyncIpc();
  registerDataIpc();
  registerSettingsIpc();
  registerShellIpc();
  registerDmIpc();
}
