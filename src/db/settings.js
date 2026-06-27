// Key/value app settings (downloadVideos, pacing, partitionSeq, …).
import { db } from './connection.js';

export const getSetting = (key, def = null) => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : def;
};
export const setSetting = (key, value) =>
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
export const getSettings = () =>
  Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
