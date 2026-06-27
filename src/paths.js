// Filesystem locations, derived from Electron's per-app userData dir.
import { app } from 'electron';
import path from 'node:path';

export const userDataDir = () => app.getPath('userData');
export const dataDir = () => path.join(userDataDir(), 'data');
export const mediaDir = (platform) => path.join(dataDir(), 'media', platform);
