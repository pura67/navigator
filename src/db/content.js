// Writes + lookups for synced content: media, insights, saved, connections.
import { db, now } from './connection.js';

export const saveMedia = (rows) => {
  const stmt = db.prepare(`
    INSERT INTO media (id, account_id, platform, code, media_id, media_type, product_type, caption, taken_at,
      like_count, comment_count, view_count, play_count, reshare_count, carousel_count,
      thumbnail_url, video_url, permalink, local_thumb, local_video, raw_json, synced_at)
    VALUES (@id,@account_id,@platform,@code,@media_id,@media_type,@product_type,@caption,@taken_at,
      @like_count,@comment_count,@view_count,@play_count,@reshare_count,@carousel_count,
      @thumbnail_url,@video_url,@permalink,@local_thumb,@local_video,@raw_json,@synced_at)
    ON CONFLICT(id) DO UPDATE SET
      caption=excluded.caption, like_count=excluded.like_count, comment_count=excluded.comment_count,
      view_count=excluded.view_count, play_count=excluded.play_count, reshare_count=excluded.reshare_count,
      thumbnail_url=excluded.thumbnail_url, video_url=excluded.video_url,
      local_thumb=COALESCE(excluded.local_thumb, media.local_thumb),
      local_video=COALESCE(excluded.local_video, media.local_video),
      raw_json=excluded.raw_json, synced_at=excluded.synced_at
  `);
  const tx = db.transaction((list) => { for (const r of list) stmt.run({ local_thumb: null, local_video: null, synced_at: now(), ...r }); });
  tx(rows);
};

export const saveInsight = (mediaId, accountId, json) =>
  db.prepare(`INSERT INTO media_insights (media_id, account_id, json, captured_at) VALUES (?,?,?,?)
    ON CONFLICT(media_id) DO UPDATE SET json=excluded.json, captured_at=excluded.captured_at`)
    .run(mediaId, accountId, JSON.stringify(json), now());

export const saveSaved = (rows) => {
  const stmt = db.prepare(`
    INSERT INTO saved_media (id, account_id, code, owner_username, media_type, caption, taken_at,
      thumbnail_url, video_url, permalink, local_thumb, local_video, raw_json, synced_at)
    VALUES (@id,@account_id,@code,@owner_username,@media_type,@caption,@taken_at,
      @thumbnail_url,@video_url,@permalink,@local_thumb,@local_video,@raw_json,@synced_at)
    ON CONFLICT(id) DO UPDATE SET caption=excluded.caption, thumbnail_url=excluded.thumbnail_url, video_url=excluded.video_url,
      local_thumb=COALESCE(excluded.local_thumb, saved_media.local_thumb),
      local_video=COALESCE(excluded.local_video, saved_media.local_video), raw_json=excluded.raw_json, synced_at=excluded.synced_at
  `);
  const tx = db.transaction((list) => { for (const r of list) stmt.run({ local_thumb: null, local_video: null, video_url: null, synced_at: now(), ...r }); });
  tx(rows);
};

// Video rows (reels) that haven't been downloaded yet — for "fill missing videos".
export const countMissingVideos = (accountId, table) =>
  db.prepare(`SELECT COUNT(*) n FROM ${table === 'saved' ? 'saved_media' : 'media'} WHERE account_id=? AND media_type=2 AND local_video IS NULL`).get(accountId).n;

export const saveConnections = (accountId, kind, rows) => {
  const stmt = db.prepare(`
    INSERT INTO connections (account_id, kind, user_id, username, full_name, is_private, is_verified, profile_pic_url, raw_json, captured_at)
    VALUES (@account_id,@kind,@user_id,@username,@full_name,@is_private,@is_verified,@profile_pic_url,@raw_json,@captured_at)
    ON CONFLICT(account_id, kind, user_id) DO UPDATE SET username=excluded.username, full_name=excluded.full_name,
      is_private=excluded.is_private, is_verified=excluded.is_verified, profile_pic_url=excluded.profile_pic_url,
      raw_json=excluded.raw_json, captured_at=excluded.captured_at
  `);
  const tx = db.transaction((list) => { for (const r of list) stmt.run({ account_id: accountId, kind, captured_at: now(), ...r }); });
  tx(rows);
};

// Incremental sync: codes we already have, so paginators can stop early.
export const existingCodes = (accountId, kind) => {
  const t = kind === 'saved' ? 'saved_media' : 'media';
  return new Set(db.prepare(`SELECT code FROM ${t} WHERE account_id=?`).all(accountId).map((r) => r.code));
};

// Media rows still lacking an insights record (so insights re-runs only fill gaps).
export const mediaMissingInsights = (accountId) =>
  db.prepare('SELECT id, media_id FROM media WHERE account_id=? AND id NOT IN (SELECT media_id FROM media_insights WHERE account_id=?)').all(accountId, accountId);
