// Direct messages: thread list + shared media pulled from selected threads.
import { db } from './connection.js';

export const saveDmThreads = (accountId, rows) => {
  const stmt = db.prepare(`INSERT INTO dm_threads (account_id, thread_id, title, users_json, last_activity_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(account_id, thread_id) DO UPDATE SET title=excluded.title, users_json=excluded.users_json, last_activity_at=excluded.last_activity_at`);
  const tx = db.transaction((list) => { for (const t of list) stmt.run(accountId, t.thread_id, t.title || null, JSON.stringify(t.users || []), t.last_activity_at || null); });
  tx(rows);
};

export const getDmThreads = (accountId) =>
  db.prepare('SELECT thread_id, title, users_json, last_activity_at FROM dm_threads WHERE account_id=? ORDER BY last_activity_at DESC').all(accountId)
    .map((r) => ({ thread_id: r.thread_id, title: r.title, users: JSON.parse(r.users_json || '[]'), last_activity_at: r.last_activity_at }));

export const saveDmShared = (rows) => {
  const stmt = db.prepare(`INSERT INTO dm_shared (id, account_id, thread_id, item_type, code, owner_username, media_type, caption, thumbnail_url, video_url, permalink, local_thumb, local_video, shared_at, raw_json)
    VALUES (@id,@account_id,@thread_id,@item_type,@code,@owner_username,@media_type,@caption,@thumbnail_url,@video_url,@permalink,@local_thumb,@local_video,@shared_at,@raw_json)
    ON CONFLICT(id) DO UPDATE SET thumbnail_url=excluded.thumbnail_url, video_url=excluded.video_url,
      local_thumb=COALESCE(excluded.local_thumb, dm_shared.local_thumb),
      local_video=COALESCE(excluded.local_video, dm_shared.local_video), raw_json=excluded.raw_json`);
  const tx = db.transaction((list) => { for (const r of list) stmt.run({ local_thumb: null, local_video: null, ...r }); });
  tx(rows);
};

export const existingDmIds = (accountId) =>
  new Set(db.prepare('SELECT id FROM dm_shared WHERE account_id=?').all(accountId).map((r) => r.id));
export const dmSharedCount = (accountId) => db.prepare('SELECT COUNT(*) n FROM dm_shared WHERE account_id=?').get(accountId).n;
export const listDmShared = (accountId, limit = 300) =>
  db.prepare('SELECT code, owner_username, item_type, caption, permalink, thumbnail_url, local_video, shared_at FROM dm_shared WHERE account_id=? ORDER BY shared_at DESC LIMIT ?').all(accountId, limit);
