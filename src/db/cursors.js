// Resume markers — where each category's sync left off (per account + category).
import { db, now } from './connection.js';

export const getCursor = (accountId, category) =>
  db.prepare('SELECT next_max_id, complete, last_full_at FROM sync_cursors WHERE account_id=? AND category=?').get(accountId, category)
  || { next_max_id: null, complete: 0, last_full_at: null };

export const setCursor = (accountId, category, patch) => {
  const next = { ...getCursor(accountId, category), ...patch };
  db.prepare(`INSERT INTO sync_cursors (account_id, category, next_max_id, complete, updated_at, last_full_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(account_id, category) DO UPDATE SET
      next_max_id=excluded.next_max_id, complete=excluded.complete, updated_at=excluded.updated_at, last_full_at=excluded.last_full_at`)
    .run(accountId, category, next.next_max_id ?? null, next.complete ? 1 : 0, now(), next.last_full_at ?? null);
};
