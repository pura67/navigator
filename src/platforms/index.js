import instagram from './instagram.js';
import youtube from './youtube.js';
import tiktok from './tiktok.js';

export const ADAPTERS = { instagram, youtube, tiktok };

export function getAdapter(id) {
  const a = ADAPTERS[id];
  if (!a) throw new Error(`unknown platform '${id}'`);
  return a;
}

// Lightweight metadata for the UI (no functions).
export function listPlatforms() {
  return Object.values(ADAPTERS).map((a) => ({
    id: a.id,
    label: a.label,
    enabled: a.enabled,
    scopes: a.scopes,
    dm: typeof a.listDmThreads === 'function' && typeof a.syncDmThreads === 'function',
  }));
}
