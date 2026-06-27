// Sync run history (audit log of each sync).
import { db } from './connection.js';

export const recordRun = (row) =>
  db.prepare(`INSERT INTO runs (account_id, platform, scope, started_at, finished_at, status, stats_json)
    VALUES (@account_id,@platform,@scope,@started_at,@finished_at,@status,@stats_json)`).run(row);
