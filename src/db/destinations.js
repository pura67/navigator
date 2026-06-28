// CRUD for remote destinations + the per-destination "already shipped" ledger.
import { db, now } from './connection.js';

const parse = (r) => (r ? { ...r, enabled: !!r.enabled, config: JSON.parse(r.config_json || '{}'), config_json: undefined } : null);

export const listDestinations = () =>
  db.prepare('SELECT * FROM destinations ORDER BY created_at DESC').all().map(parse);

export const getDestination = (id) =>
  parse(db.prepare('SELECT * FROM destinations WHERE id=?').get(id));

export function saveDestination({ id, name, type, config, enabled = true }) {
  const cfg = JSON.stringify(config || {});
  if (id) {
    db.prepare('UPDATE destinations SET name=?, type=?, config_json=?, enabled=? WHERE id=?')
      .run(name, type, cfg, enabled ? 1 : 0, id);
    return getDestination(id);
  }
  const r = db.prepare('INSERT INTO destinations (name, type, config_json, enabled, created_at) VALUES (?,?,?,?,?)')
    .run(name, type, cfg, enabled ? 1 : 0, now());
  return getDestination(r.lastInsertRowid);
}

export const deleteDestination = (id) => db.prepare('DELETE FROM destinations WHERE id=?').run(id);

export function markPush(id, status) {
  db.prepare('UPDATE destinations SET last_push_at=?, last_status=? WHERE id=?').run(now(), status, id);
}

// ── dedup ledger ──
export function shippedRefs(destinationId, accountId) {
  const set = new Set();
  for (const r of db.prepare('SELECT ref FROM export_log WHERE destination_id=? AND account_id=?').all(destinationId, accountId))
    set.add(r.ref);
  return set;
}

const logStmt = () =>
  db.prepare('INSERT OR IGNORE INTO export_log (destination_id, account_id, ref, pushed_at) VALUES (?,?,?,?)');

export function recordShipped(destinationId, accountId, refs) {
  const stmt = logStmt();
  const t = now();
  const tx = db.transaction((rs) => { for (const ref of rs) stmt.run(destinationId, accountId, ref, t); });
  tx(refs);
}

// Forget the ledger for one destination/account so the next push re-sends everything.
export const resetLedger = (destinationId, accountId) =>
  db.prepare('DELETE FROM export_log WHERE destination_id=? AND account_id=?').run(destinationId, accountId);
