// Main application window + a helper to push events to the renderer.
import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWin = null;

export function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1040,
    height: 760,
    title: 'Navigator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'ui', 'index.html'));
  return mainWin;
}

export const getMainWin = () => mainWin;

// Push an event to the renderer (no-op if the window is gone).
export const emit = (channel, payload) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
};
