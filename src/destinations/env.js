// Optional: preconfigure destinations at launch without typing them into the UI.
// Set ONE of:
//   NAVIGATOR_DESTINATION       inline JSON (object or array of objects)
//   NAVIGATOR_DESTINATION_FILE  path to a JSON file (keeps secrets out of the
//                               process list / shell history)
// Each object: { name, type, config, enabled? }. Import is idempotent — a
// destination is matched by name and updated in place, so relaunching is safe.
import fs from 'node:fs';

import * as DB from '../db/index.js';
import { TYPES } from './index.js';

const VALID = new Set(TYPES.map((t) => t.id));

function read() {
  const file = process.env.NAVIGATOR_DESTINATION_FILE;
  const inline = process.env.NAVIGATOR_DESTINATION;
  const raw = file ? fs.readFileSync(file, 'utf8') : inline;
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// Returns the names imported, for logging. Never throws — a bad env var must not
// stop the app from starting.
export function importDestinationsFromEnv() {
  let entries;
  try { entries = read(); } catch (e) { console.error('[destinations] env import skipped:', e.message); return []; }
  if (!entries.length) return [];

  const existing = DB.listDestinations();
  const done = [];
  for (const e of entries) {
    if (!e || !e.name || !VALID.has(e.type)) { console.error('[destinations] env entry skipped (need name + valid type):', e?.name); continue; }
    const match = existing.find((d) => d.name === e.name);
    try {
      DB.saveDestination({ id: match?.id, name: e.name, type: e.type, config: e.config || {}, enabled: e.enabled !== false });
      done.push(e.name);
    } catch (err) { console.error(`[destinations] env entry "${e.name}" failed:`, err.message); }
  }
  return done;
}
