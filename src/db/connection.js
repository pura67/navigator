// SQLite connection + schema + migrations. One file at userData/data/self-sync.db.
// `db` is a live ESM binding set by initDb() — every db/* module imports it and
// reads it at call-time (after init), so no getter plumbing is needed.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export let db; // set by initDb()
export const now = () => Math.floor(Date.now() / 1000);

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL, user_id TEXT NOT NULL,
    username TEXT, display_name TEXT, profile_json TEXT, connected_at INTEGER,
    UNIQUE(platform, user_id)
  );
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT, code TEXT, media_id TEXT,
    media_type INTEGER, product_type TEXT, caption TEXT, taken_at INTEGER,
    like_count INTEGER, comment_count INTEGER, view_count INTEGER, play_count INTEGER,
    reshare_count INTEGER, carousel_count INTEGER,
    thumbnail_url TEXT, video_url TEXT, permalink TEXT,
    local_thumb TEXT, local_video TEXT, raw_json TEXT, synced_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS media_insights (
    media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
    account_id INTEGER, json TEXT, captured_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS saved_media (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    code TEXT, owner_username TEXT, media_type INTEGER, caption TEXT, taken_at INTEGER,
    thumbnail_url TEXT, video_url TEXT, permalink TEXT, local_thumb TEXT, local_video TEXT, raw_json TEXT, synced_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS connections (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, user_id TEXT NOT NULL,
    username TEXT, full_name TEXT, is_private INTEGER, is_verified INTEGER,
    profile_pic_url TEXT, raw_json TEXT, captured_at INTEGER,
    PRIMARY KEY (account_id, kind, user_id)
  );
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER, platform TEXT, scope TEXT,
    started_at INTEGER, finished_at INTEGER, status TEXT, stats_json TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS sync_cursors (
    account_id INTEGER NOT NULL, category TEXT NOT NULL,
    next_max_id TEXT, complete INTEGER DEFAULT 0, updated_at INTEGER, last_full_at INTEGER,
    PRIMARY KEY (account_id, category)
  );
  CREATE TABLE IF NOT EXISTS dm_threads (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL, title TEXT, users_json TEXT, last_activity_at INTEGER,
    PRIMARY KEY (account_id, thread_id)
  );
  CREATE TABLE IF NOT EXISTS dm_shared (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    thread_id TEXT, item_type TEXT, code TEXT, owner_username TEXT, media_type INTEGER,
    caption TEXT, thumbnail_url TEXT, video_url TEXT, permalink TEXT,
    local_thumb TEXT, local_video TEXT, shared_at INTEGER, raw_json TEXT
  );
`;

function migrate(d) {
  // Legacy DBs (migrated from the old "self-scrape" build) named the column
  // `scraped_at`; the app writes `synced_at`. Rename in place. Idempotent.
  for (const t of ['media', 'saved_media']) {
    const cols = d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    if (cols.includes('scraped_at') && !cols.includes('synced_at')) {
      d.exec(`ALTER TABLE ${t} RENAME COLUMN scraped_at TO synced_at`);
    }
  }
  // Account switcher: per-account session partition. Backfill legacy rows.
  const aCols = d.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name);
  if (!aCols.includes('partition')) {
    d.exec('ALTER TABLE accounts ADD COLUMN partition TEXT');
    d.exec("UPDATE accounts SET partition='persist:'||platform WHERE partition IS NULL");
  }

  // Saved reels: video columns (added after first ship; saved used to store only thumbs).
  const sCols = d.prepare('PRAGMA table_info(saved_media)').all().map((c) => c.name);
  if (!sCols.includes('video_url')) d.exec('ALTER TABLE saved_media ADD COLUMN video_url TEXT');
  if (!sCols.includes('local_video')) d.exec('ALTER TABLE saved_media ADD COLUMN local_video TEXT');
}

export function initDb(userDataDir) {
  const dir = path.join(userDataDir, 'data');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'self-sync.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
