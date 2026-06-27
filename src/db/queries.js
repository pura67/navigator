// Read models for the UI: summary (counts + pending + %), category listing, export.
import { db } from './connection.js';
import { resolveAcc } from './accounts.js';
import { getCursor } from './cursors.js';
import { dmSharedCount, listDmShared } from './dm.js';

export function summary(platform, accountId) {
  const acc = resolveAcc(platform, accountId);
  if (!acc) return null;
  const c = (sql) => db.prepare(sql).get(acc.id).n;
  const prof = JSON.parse(acc.profile_json || '{}');
  const media = c('SELECT COUNT(*) n FROM media WHERE account_id=?');
  const insights = c('SELECT COUNT(*) n FROM media_insights WHERE account_id=?');
  const followers = c("SELECT COUNT(*) n FROM connections WHERE account_id=? AND kind='follower'");
  const following = c("SELECT COUNT(*) n FROM connections WHERE account_id=? AND kind='following'");
  const saved = c('SELECT COUNT(*) n FROM saved_media WHERE account_id=?');

  const pend = (have, total) => (total == null ? null : Math.max(0, total - have));
  // % complete: a finished backfill cursor = 100%; else have/total when the total
  // is known; null = unknown (e.g. saved total is hidden by IG until backfill done).
  const done = (cat) => !!getCursor(acc.id, cat).complete;
  const pct = (have, total, complete) => (complete ? 100 : total ? Math.min(100, Math.round((have / total) * 100)) : have > 0 ? null : 0);
  const percent = {
    media: pct(media, prof.media_count ?? null, done('posts')),
    followers: pct(followers, prof.follower_count ?? null, done('followers')),
    following: pct(following, prof.following_count ?? null, done('following')),
    saved: done('saved') ? 100 : saved > 0 ? null : 0,
    insights: media ? Math.round((insights / media) * 100) : 0, // best-effort, excluded from overall
  };
  const parts = [percent.media, percent.followers, percent.following, percent.saved].filter((v) => v != null);
  percent.overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;

  return {
    account: {
      id: acc.id, username: acc.username, display_name: acc.display_name, user_id: acc.user_id, connected_at: acc.connected_at,
      bio: prof.biography || null,
      profile_pic: prof.profile_pic_url || prof.hd_profile_pic_url_info?.url || null,
      is_business: !!(prof.is_business || prof.is_professional),
    },
    media,
    reels: c("SELECT COUNT(*) n FROM media WHERE account_id=? AND product_type='clips'"),
    insights, saved, followers, following,
    dm: dmSharedCount(acc.id),
    creators: db.prepare(`SELECT COUNT(DISTINCT owner_username) n FROM (
        SELECT owner_username FROM dm_shared WHERE account_id=@a
        UNION ALL SELECT owner_username FROM saved_media WHERE account_id=@a
      ) WHERE owner_username IS NOT NULL AND owner_username <> ''`).get({ a: acc.id }).n,
    downloads: downloadStats(acc.id),
    totals: { media: prof.media_count ?? null, followers: prof.follower_count ?? null, following: prof.following_count ?? null },
    pending: {
      media: pend(media, prof.media_count ?? null),
      followers: pend(followers, prof.follower_count ?? null),
      following: pend(following, prof.following_count ?? null),
      insights: Math.max(0, media - insights),
    },
    percent,
  };
}

// Completed-download counts (files actually on disk) per content type.
// thumbs/videos = rows with a local file; items = total rows.
function downloadStats(accountId) {
  const one = (table) => {
    const r = db.prepare(`SELECT COUNT(*) n, COUNT(local_thumb) t, COUNT(local_video) v FROM ${table} WHERE account_id=?`).get(accountId);
    return { items: r.n, thumbs: r.t, videos: r.v };
  };
  const d = { media: one('media'), saved: one('saved_media'), dm: one('dm_shared') };
  d.totalThumbs = d.media.thumbs + d.saved.thumbs + d.dm.thumbs;
  d.totalVideos = d.media.videos + d.saved.videos + d.dm.videos;
  return d;
}

// Explorer: group collected media (DM shares + saved) by the CREATOR (owner).
// Own posts are excluded (that's you). Returns one row per @creator.
export function listCreators(platform, accountId) {
  const acc = resolveAcc(platform, accountId);
  if (!acc) return [];
  return db.prepare(`
    SELECT owner_username AS username,
      COUNT(*) AS items,
      SUM(CASE WHEN media_type = 2 THEN 1 ELSE 0 END) AS reels,
      COUNT(local_video) AS videos,
      COUNT(local_thumb) AS thumbs,
      SUM(CASE WHEN src='dm' THEN 1 ELSE 0 END) AS dm,
      SUM(CASE WHEN src='saved' THEN 1 ELSE 0 END) AS saved,
      MAX(local_thumb) AS sample
    FROM (
      SELECT owner_username, media_type, local_video, local_thumb, 'dm' AS src FROM dm_shared WHERE account_id=@a
      UNION ALL
      SELECT owner_username, media_type, local_video, local_thumb, 'saved' AS src FROM saved_media WHERE account_id=@a
    )
    WHERE owner_username IS NOT NULL AND owner_username <> ''
    GROUP BY owner_username
    ORDER BY items DESC
  `).all({ a: acc.id });
}

// Explorer: all collected items for one creator (DM + saved).
export function listByCreator(platform, accountId, username, limit = 300) {
  const acc = resolveAcc(platform, accountId);
  if (!acc) return [];
  return db.prepare(`
    SELECT 'dm' AS src, code, media_type, caption, permalink, local_video, local_thumb, item_type FROM dm_shared WHERE account_id=@a AND owner_username=@u
    UNION ALL
    SELECT 'saved' AS src, code, media_type, caption, permalink, local_video, local_thumb, NULL AS item_type FROM saved_media WHERE account_id=@a AND owner_username=@u
    ORDER BY src, code
    LIMIT @lim
  `).all({ a: acc.id, u: username, lim: limit });
}

export function listItems(platform, category, accountId, limit = 300) {
  const acc = resolveAcc(platform, accountId);
  if (!acc) return [];
  const a = acc.id;
  const MEDIA_COLS = 'code,product_type,media_type,like_count,comment_count,view_count,caption,taken_at,permalink,local_video';
  switch (category) {
    case 'posts':
      return db.prepare(`SELECT ${MEDIA_COLS} FROM media WHERE account_id=? ORDER BY taken_at DESC LIMIT ?`).all(a, limit);
    case 'reels':
      return db.prepare(`SELECT ${MEDIA_COLS} FROM media WHERE account_id=? AND product_type='clips' ORDER BY taken_at DESC LIMIT ?`).all(a, limit);
    case 'saved':
      return db.prepare('SELECT code,owner_username,media_type,caption,taken_at,permalink,local_video FROM saved_media WHERE account_id=? ORDER BY taken_at DESC LIMIT ?').all(a, limit);
    case 'followers':
    case 'following':
      return db.prepare('SELECT username,full_name,is_verified,is_private FROM connections WHERE account_id=? AND kind=? ORDER BY username COLLATE NOCASE LIMIT ?')
        .all(a, category === 'followers' ? 'follower' : 'following', limit);
    case 'insights':
      return db.prepare('SELECT m.code AS code, m.caption AS caption, mi.json AS json FROM media_insights mi JOIN media m ON m.id=mi.media_id WHERE mi.account_id=? LIMIT ?').all(a, limit);
    case 'dm':
      return listDmShared(a, limit);
    default:
      return [];
  }
}

export function exportAccount(platform, accountId) {
  const acc = resolveAcc(platform, accountId);
  if (!acc) return null;
  return {
    account: { ...acc, profile_json: undefined, profile: JSON.parse(acc.profile_json || '{}') },
    media: db.prepare('SELECT * FROM media WHERE account_id=?').all(acc.id),
    insights: db.prepare('SELECT * FROM media_insights WHERE account_id=?').all(acc.id),
    saved: db.prepare('SELECT * FROM saved_media WHERE account_id=?').all(acc.id),
    connections: db.prepare('SELECT * FROM connections WHERE account_id=?').all(acc.id),
  };
}
