// Turns one account's local rows into a generic, vendor-neutral export shape:
//   - records: normalized JSON objects, grouped by kind, each with a stable `ref`
//   - blobs:   on-disk media files (relative paths) referenced by those records
// `ref` strings double as idempotency keys in the export ledger, so a re-push
// only ships what changed. Nothing here knows or cares where the data goes.
import { db } from '../db/connection.js';

export const SCHEMA = 'social-export/1';

const j = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const clean = (row) => {
  const { account_id, raw_json, ...rest } = row;
  const raw = j(raw_json);
  return raw ? { ...rest, raw } : rest;
};

// kind → how to read + identify its rows, and which columns point at media files.
const KINDS = {
  profile: {
    rows: (a) => {
      const acc = db.prepare('SELECT * FROM accounts WHERE id=?').get(a);
      if (!acc) return [];
      return [{ id: acc.user_id, user_id: acc.user_id, username: acc.username, display_name: acc.display_name, connected_at: acc.connected_at, profile: j(acc.profile_json) }];
    },
    ref: (r) => `profile:${r.user_id}`,
    blobs: [],
  },
  media: {
    rows: (a) => db.prepare('SELECT * FROM media WHERE account_id=?').all(a),
    ref: (r) => `media:${r.id}`,
    blobs: ['local_thumb', 'local_video'],
  },
  saved: {
    rows: (a) => db.prepare('SELECT * FROM saved_media WHERE account_id=?').all(a),
    ref: (r) => `saved:${r.id}`,
    blobs: ['local_thumb', 'local_video'],
  },
  insights: {
    rows: (a) => db.prepare('SELECT * FROM media_insights WHERE account_id=?').all(a),
    ref: (r) => `insight:${r.media_id}`,
    blobs: [],
  },
  followers: {
    rows: (a) => db.prepare("SELECT * FROM connections WHERE account_id=? AND kind='follower'").all(a),
    ref: (r) => `follower:${r.user_id}`,
    blobs: [],
  },
  following: {
    rows: (a) => db.prepare("SELECT * FROM connections WHERE account_id=? AND kind='following'").all(a),
    ref: (r) => `following:${r.user_id}`,
    blobs: [],
  },
  dm: {
    rows: (a) => db.prepare('SELECT * FROM dm_shared WHERE account_id=?').all(a),
    ref: (r) => `dm:${r.id}`,
    blobs: ['local_thumb', 'local_video'],
  },
};

export const ALL_KINDS = Object.keys(KINDS);

export function source(acc) {
  return {
    platform: acc.platform,
    account: { user_id: acc.user_id, username: acc.username, display_name: acc.display_name },
  };
}

// Records of one kind not yet in `shipped`. Returns [{ ref, data }].
export function records(accountId, kind, shipped = new Set()) {
  const spec = KINDS[kind];
  if (!spec) return [];
  const out = [];
  for (const row of spec.rows(accountId)) {
    const ref = spec.ref(row);
    if (shipped.has(ref)) continue;
    out.push({ ref, data: clean(row) });
  }
  return out;
}

// Distinct media files of one kind not yet in `shipped`. Returns [{ ref, relPath }].
export function blobs(accountId, kind, shipped = new Set()) {
  const spec = KINDS[kind];
  if (!spec?.blobs.length) return [];
  const out = [];
  const seen = new Set();
  for (const row of spec.rows(accountId)) {
    for (const field of spec.blobs) {
      const rel = row[field];
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      const ref = `blob:${rel}`;
      if (!shipped.has(ref)) out.push({ ref, relPath: rel });
    }
  }
  return out;
}
