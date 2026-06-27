// Account CRUD + resolution.
import { db, now } from './connection.js';

export function upsertAccount({ platform, user_id, username, display_name, profile, partition }) {
  db.prepare(`
    INSERT INTO accounts (platform, user_id, username, display_name, profile_json, connected_at, partition)
    VALUES (@platform, @user_id, @username, @display_name, @profile_json, @connected_at, @partition)
    ON CONFLICT(platform, user_id) DO UPDATE SET
      username=excluded.username, display_name=excluded.display_name,
      profile_json=excluded.profile_json, connected_at=excluded.connected_at,
      partition=COALESCE(accounts.partition, excluded.partition)
  `).run({ platform, user_id, username, display_name, profile_json: JSON.stringify(profile || {}), connected_at: now(), partition: partition || null });
  return getAccountByUser(platform, user_id);
}

export const getAccount = (platform) =>
  db.prepare('SELECT * FROM accounts WHERE platform=? ORDER BY connected_at DESC LIMIT 1').get(platform);
export const getAccountById = (id) => db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
export const getAccountByUser = (platform, userId) =>
  db.prepare('SELECT * FROM accounts WHERE platform=? AND user_id=?').get(platform, userId);

// For the account switcher (no profile_json blob).
export const getAccounts = (platform) =>
  db.prepare('SELECT id, user_id, username, display_name, partition FROM accounts WHERE platform=? ORDER BY connected_at DESC').all(platform);

export const deleteAccount = (platform) => db.prepare('DELETE FROM accounts WHERE platform=?').run(platform);
export const deleteAccountById = (id) => db.prepare('DELETE FROM accounts WHERE id=?').run(id);

// Resolve a specific account (by id) or fall back to the platform's latest.
export const resolveAcc = (platform, accountId) =>
  accountId ? getAccountById(accountId) : getAccount(platform);
