// Instagram self-account adapter.
//
// Uses Instagram's private web API (/api/v1, app-id 936619743392459) — the exact
// same endpoints the website itself calls. Because every request runs from a
// hidden window already logged into instagram.com (see sync/session-fetch.js),
// calls are same-origin with the real browser fingerprint: no header forgery, no
// datacenter 429s. We only sync the *logged-in* user's own data.

import { defineAdapter } from './base.js';

const BASE = 'https://www.instagram.com';
const APP_ID = '936619743392459';

// Human-like pacing. IG throttles aggressively, so requests go out at
// randomized intervals with occasional longer "breaks", plus 429 backoff.
// Profile chosen by the user (ctx.options.pacing); 'balanced' is the default.
const PACING = {
  balanced: { pageMin: 2000, pageMax: 5000, insightMin: 3000, insightMax: 6000, longEvery: 8, longMin: 15000, longMax: 30000 },
  slow: { pageMin: 5000, pageMax: 12000, insightMin: 8000, insightMax: 15000, longEvery: 5, longMin: 30000, longMax: 60000 },
};
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
const nowS = () => Math.floor(Date.now() / 1000);
const pacingOf = (ctx) => PACING[ctx.options?.pacing] || PACING.balanced;

// Date cutoff → unix seconds. Posts/reels stop paginating at it; saved & DM keep
// their record but skip downloading media older than it. null = no limit.
function cutoffToTs(cutoff) {
  if (!cutoff || cutoff === 'all') return null;
  const DAY = 86400;
  if (cutoff === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000); }
  if (cutoff === '30d') return nowS() - 30 * DAY;
  if (cutoff === '12mo') return nowS() - 365 * DAY;
  const t = Date.parse(`${cutoff}T00:00:00`); // custom 'YYYY-MM-DD' (local midnight)
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}
// Thumbnails are always downloaded. Video mp4s only when the user enables
// "Download videos" (ctx.options.downloadVideos) — they're big.

// ── helpers ──────────────────────────────────────────────────────────────────

function thumbOf(item) {
  const m = item.media_type === 8 && item.carousel_media?.length ? item.carousel_media[0] : item;
  return m.image_versions2?.candidates?.[0]?.url || null;
}

function normalizeMedia(item, accountId) {
  return {
    id: `instagram:${item.code}`,
    account_id: accountId,
    platform: 'instagram',
    code: item.code,
    media_id: item.id || item.pk, // "pk_userid" form, used for insights
    media_type: item.media_type, // 1 photo, 2 video/reel, 8 carousel
    product_type: item.product_type || null, // 'clips' = reel, 'feed', 'igtv', 'carousel_container'
    caption: item.caption?.text || null,
    taken_at: item.taken_at || null,
    like_count: item.like_count ?? null,
    comment_count: item.comment_count ?? null,
    view_count: item.view_count ?? item.play_count ?? null,
    play_count: item.play_count ?? null,
    reshare_count: item.reshare_count ?? null,
    carousel_count: item.media_type === 8 ? (item.carousel_media?.length || null) : null,
    thumbnail_url: thumbOf(item),
    video_url: item.video_versions?.[0]?.url || null,
    permalink: `${BASE}/p/${item.code}/`,
    raw_json: JSON.stringify(item),
  };
}

// ── DM shared-media extraction ───────────────────────────────────────────────
// IG DM items come in many shapes: classic full-media (media_share/clip/story_share/
// reel_share/media/visual_media/raven_media) AND the newer XMA attachment format
// (xma_media_share/xma_reel_share/…). We normalize all of them, with a generic
// xma_* fallback so nothing shared is silently dropped. Returns null only for
// genuinely non-media items (text, reactions, action logs, link cards, audio).

const CODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const codeFromUrl = (u) => (u || '').match(CODE_RE)?.[1] || null;

// A full IG media object (post/reel/story/photo/video).
function fromMedia(m) {
  const cover = m.media_type === 8 && m.carousel_media?.length ? m.carousel_media[0] : m;
  return {
    code: m.code || null,
    media_type: m.media_type ?? null,
    owner: m.user?.username || m.owner?.username || null,
    caption: m.caption?.text || null,
    thumbnail_url: cover?.image_versions2?.candidates?.[0]?.url || cover?.image_versions2?.additional_candidates?.first_frame?.url || null,
    video_url: m.video_versions?.[0]?.url || null,
    permalink: m.code ? `${BASE}/p/${m.code}/` : null,
  };
}

// An XMA attachment object (preview + target URL, often no full media object).
function fromXma(x) {
  const target = x.target_url || x.header_title_text_uri || x.action_url || null;
  const code = codeFromUrl(target);
  return {
    code,
    media_type: x.playable_url || x.video_dash_manifest ? 2 : 1,
    owner: (x.header_title_text || '').replace(/^@/, '').trim() || null,
    caption: x.subtitle_text || x.header_subtitle_text || null,
    thumbnail_url: x.preview_url || x.preview_url_info?.url || x.cover_photo?.url || null,
    video_url: x.playable_url || null,
    permalink: target && /^https?:/.test(target) ? target : code ? `${BASE}/p/${code}/` : null,
  };
}

function extractShared(item, threadId, accountId) {
  const t = item.item_type || 'unknown';
  let p = null;

  const media = item.media_share || item.clip?.clip || (item.clip?.image_versions2 ? item.clip : null)
    || item.story_share?.media || item.reel_share?.media || item.media
    || item.visual_media?.media || item.raven_media?.media;
  if (media && (media.image_versions2 || media.video_versions || media.code)) {
    p = fromMedia(media);
  } else {
    // any xma_* field (the typed one first, then a generic scan)
    let x = Array.isArray(item[t]) ? item[t][0] : t.startsWith('xma_') ? item[t] : null;
    if (!x) for (const [k, v] of Object.entries(item)) {
      if (!k.startsWith('xma_')) continue;
      const cand = Array.isArray(v) ? v[0] : v;
      if (cand && (cand.preview_url || cand.target_url || cand.playable_url || cand.preview_url_info)) { x = cand; break; }
    }
    if (x) p = fromXma(x);
  }

  // Need at least one usable signal, else it's not shared media (text/link/etc.).
  if (!p || (!p.thumbnail_url && !p.video_url && !p.code)) return null;

  return {
    id: `dm:${threadId}:${item.item_id}`,
    account_id: accountId, thread_id: threadId, item_type: t,
    code: p.code || null,
    owner_username: p.owner || null,
    media_type: p.media_type ?? null,
    caption: p.caption || null,
    thumbnail_url: p.thumbnail_url || null,
    video_url: p.video_url || null,
    permalink: p.permalink || (p.code ? `${BASE}/p/${p.code}/` : null),
    shared_at: item.timestamp ? Math.floor(item.timestamp / 1000000) : null,
    raw_json: JSON.stringify(item),
  };
}

function normalizeUser(u) {
  return {
    user_id: String(u.pk || u.id || u.pk_id || ''),
    username: u.username || null,
    full_name: u.full_name || null,
    is_private: u.is_private ? 1 : 0,
    is_verified: u.is_verified ? 1 : 0,
    profile_pic_url: u.profile_pic_url || null,
    raw_json: JSON.stringify(u),
  };
}

// Generic cursor paginator over IG's max_id endpoints.
// - jittered delays + occasional longer pauses (human-like pacing)
// - 429 backoff that respects Retry-After (retries the same page, doesn't advance)
// - resumable: startMaxId resumes mid-list; onPage(items, nextMaxId) persists each
//   page (save rows + advance the cursor) so an interrupted run continues next time
// - incremental: stopOnSeen(item) stops once we reach already-synced data
// Returns { total, exhausted, stoppedSeen } — exhausted=true means the whole list
// was reached (mark the cursor complete).
async function paginate(ctx, emit, { buildUrl, pick, label, startMaxId = null, stopOnSeen, onPage, maxPages = 5000 }) {
  const p = pacingOf(ctx);
  let maxId = startMaxId, page = 0, retries = 0, total = 0, exhausted = false, stoppedSeen = false;
  while (page < maxPages) {
    const { status, data, retryAfter } = await ctx.fetch(buildUrl(maxId));

    if (status === 429) {
      if (retries < 4) {
        const wait = retryAfter ? Math.min((parseInt(retryAfter, 10) || 0) * 1000, 300000) : rand(20000, 45000) * (retries + 1);
        emit({ type: 'warn', message: `${label}: rate-limited — waiting ${Math.round(wait / 1000)}s (retry ${retries + 1}/4)` });
        await ctx.sleep(wait); retries++; continue; // retry same page (cursor unchanged → safe)
      }
      emit({ type: 'warn', message: `${label}: still limited — stopping. Progress saved; run again to resume.` });
      break;
    }
    if (status !== 200 || !data) {
      const msg = (data?.message || '').toLowerCase();
      if (msg.includes('challenge') || msg.includes('checkpoint') || msg.includes('login_required') || msg.includes('feedback_required')) {
        emit({ type: 'warn', message: `${label}: Instagram wants to verify this session ("${data.message}"). Open instagram.com in a normal browser, finish the check, then sync again — and ease off for a bit.` });
      } else {
        emit({ type: 'warn', message: `${label}: HTTP ${status} — stopping section (progress saved)` });
      }
      break;
    }
    retries = 0;

    const { items, nextMaxId } = pick(data);
    const fresh = [];
    for (const it of items) {
      if (stopOnSeen && stopOnSeen(it)) { stoppedSeen = true; break; }
      fresh.push(it);
    }
    total += fresh.length;
    page++;
    const advance = stoppedSeen ? null : nextMaxId; // null cursor = nothing more to do
    if (onPage) await onPage(fresh, advance);
    emit({ type: 'progress', message: `${label}: ${total}${stopOnSeen ? ' new' : ''} so far (page ${page})`, count: total });

    if (stoppedSeen) { emit({ type: 'progress', message: `${label}: reached already-synced items — caught up` }); break; }
    if (!nextMaxId) { exhausted = true; break; }
    maxId = nextMaxId;

    if (p.longEvery && page % p.longEvery === 0) {
      const lp = rand(p.longMin, p.longMax);
      emit({ type: 'progress', message: `pausing ${Math.round(lp / 1000)}s to stay under the radar…` });
      await ctx.sleep(lp);
    } else {
      await ctx.sleep(rand(p.pageMin, p.pageMax));
    }
  }
  return { total, exhausted, stoppedSeen };
}

// ── adapter ──────────────────────────────────────────────────────────────────

export default defineAdapter({
  id: 'instagram',
  label: 'Instagram',
  enabled: true,
  partition: 'persist:instagram',
  cookieDomain: '.instagram.com',
  loginUrl: `${BASE}/accounts/login/`,
  homeUrl: `${BASE}/`,

  loginSuccess(url, cookies) {
    // Logged in only once cookies are set AND we're off any auth/challenge page.
    // IG sets sessionid on the checkpoint page itself, so without excluding
    // challenge/checkpoint/2FA we'd "succeed" mid-challenge → resolveAccount hits
    // the checkpoint and the whole add-account fails. Waiting lets the user clear
    // IG's security check (expected when adding a 2nd account) before we proceed.
    if (!cookies.sessionid || !cookies.ds_user_id) return false;
    return !/accounts\/login|\/challenge|\/checkpoint|two_factor|two_step/.test(url);
  },

  buildHeaders(cookies) {
    return {
      'X-IG-App-ID': APP_ID,
      'X-CSRFToken': cookies.csrftoken || '',
      'X-Requested-With': 'XMLHttpRequest',
      'X-ASBD-ID': '129477',
    };
  },

  async resolveAccount(ctx) {
    const uid = ctx.cookies.ds_user_id;
    if (!uid) throw new Error('no ds_user_id cookie — login incomplete');
    const { status, data } = await ctx.fetch(`${BASE}/api/v1/users/${uid}/info/`);
    if (status !== 200 || !data?.user) throw new Error(`profile fetch failed (HTTP ${status})`);
    const u = data.user;
    return { user_id: uid, username: u.username, display_name: u.full_name || u.username, profile: u };
  },

  scopes: [
    { key: 'media',       label: 'Posts + Reels' },
    { key: 'insights',    label: 'Insights / analytics' },
    { key: 'saved',       label: 'Saved posts' },
    { key: 'connections', label: 'Followers / following' },
  ],

  async sync(ctx, scope, emit) {
    const want = (k) => scope.includes(k);
    const p = pacingOf(ctx);
    const uid = ctx.userId;

    // ── Posts + Reels (incremental: stops once it reaches already-saved items) ──
    // ── Posts + Reels — backfill (resumable) once, then refresh (incremental) ──
    if (want('media')) {
      const feed = (maxId) => `${BASE}/api/v1/feed/user/${uid}/?count=33${maxId ? `&max_id=${maxId}` : ''}`;
      const pick = (d) => ({ items: d.items || [], nextMaxId: d.more_available ? d.next_max_id : null });
      const saveBatch = async (items) => {
        const media = items.map((it) => normalizeMedia(it, ctx.accountId));
        for (const m of media) {
          if (m.thumbnail_url) m.local_thumb = await ctx.downloadMedia(m.thumbnail_url, 'thumbs', `${m.code}.jpg`);
          if (ctx.options?.downloadVideos && m.video_url) m.local_video = await ctx.downloadMedia(m.video_url, 'videos', `${m.code}.mp4`);
        }
        if (media.length) ctx.saveMedia(media);
      };
      const cutoffTs = cutoffToTs(ctx.options?.cutoff);
      if (cutoffTs) {
        // Windowed: newest → cutoff date, skipping items already saved. Bounded by
        // date, so it always reads from the top (no deep-backfill cursor needed).
        emit({ type: 'progress', message: `Fetching posts/reels since ${ctx.options.cutoff}…` });
        const seen = ctx.existingCodes('media');
        const r = await paginate(ctx, emit, {
          label: 'posts/reels', buildUrl: feed, pick,
          stopOnSeen: (it) => seen.has(it.code) || (it.taken_at && it.taken_at < cutoffTs),
          onPage: async (items) => { await saveBatch(items); },
        });
        emit({ type: 'done-section', message: `Posts/reels: +${r.total} within date window` });
      } else {
        const cur = ctx.getCursor('posts');
        if (!cur.complete) { // backfill full history, resuming from the marker
          emit({ type: 'progress', message: cur.next_max_id ? 'Resuming posts/reels from last marker…' : 'Importing posts + reels (full history)…' });
          const r = await paginate(ctx, emit, {
            label: 'posts/reels', buildUrl: feed, pick, startMaxId: cur.next_max_id,
            onPage: async (items, nextMaxId) => { await saveBatch(items); ctx.setCursor('posts', { next_max_id: nextMaxId, complete: nextMaxId ? 0 : 1 }); },
          });
          if (r.exhausted) ctx.setCursor('posts', { next_max_id: null, complete: 1, last_full_at: nowS() });
          emit({ type: 'done-section', message: `Posts/reels: +${r.total} this run${r.exhausted ? ' — history complete ✓' : ' — more remain, run again to continue'}` });
        } else { // history done → only fetch what's new at the top
          emit({ type: 'progress', message: 'Checking for new posts/reels…' });
          const seen = ctx.existingCodes('media');
          const r = await paginate(ctx, emit, { label: 'posts/reels', buildUrl: feed, pick, stopOnSeen: (it) => seen.has(it.code), onPage: async (items) => { await saveBatch(items); } });
          emit({ type: 'done-section', message: `Posts/reels: +${r.total} new` });
        }
      }
    }

    // ── Insights (best-effort) — only media still missing an insights record ──
    if (want('insights')) {
      const targets = ctx.mediaMissingInsights();
      emit({ type: 'progress', message: `Fetching insights for ${targets.length} item(s) (best-effort)…` });
      let ok = 0, fail = 0;
      for (const t of targets) {
        const { status, data } = await ctx.fetch(`${BASE}/api/v1/media/${t.media_id}/insights/`);
        if (status === 200 && data) { ctx.saveInsight(t.id, data); ok++; } else { fail++; }
        await ctx.sleep(rand(p.insightMin, p.insightMax));
      }
      emit({ type: 'done-section', message: `Insights: ${ok} ok, ${fail} unavailable${fail && !ok ? ' (account likely not Pro/Creator)' : ''}` });
    }

    // ── Saved posts — backfill (resumable) once, then refresh (incremental) ──
    if (want('saved')) {
      const url = (maxId) => `${BASE}/api/v1/feed/saved/posts/?count=24${maxId ? `&max_id=${maxId}` : ''}`;
      const pick = (d) => ({ items: (d.items || []).map((x) => x.media || x), nextMaxId: d.more_available ? d.next_max_id : null });
      // Honor the date range for downloads too. Saved is ordered by save-time (not
      // post date), so we can't stop pagination early — but we skip downloading the
      // media of posts older than the cutoff, which is what blows up disk usage.
      const savedCutoffTs = cutoffToTs(ctx.options?.cutoff);
      const saveBatch = async (items) => {
        const saved = items.map((it) => ({ ...normalizeMedia(it, ctx.accountId), owner_username: it.user?.username || null }));
        for (const s of saved) {
          if (savedCutoffTs && s.taken_at && s.taken_at < savedCutoffTs) continue; // outside date range — keep the record, skip the bytes
          if (s.thumbnail_url) s.local_thumb = await ctx.downloadMedia(s.thumbnail_url, 'saved', `${s.code}.jpg`);
          if (ctx.options?.downloadVideos && s.video_url) s.local_video = await ctx.downloadMedia(s.video_url, 'saved', `${s.code}.mp4`);
        }
        if (saved.length) ctx.saveSaved(saved);
      };
      const cur = ctx.getCursor('saved');
      // If videos are wanted but some saved reels have no local file yet (e.g. the
      // toggle was turned on after a previous sync), re-pull from the top once to
      // grab fresh video URLs and download them — IG's video URLs expire, so we
      // must re-fetch rather than reuse stored ones.
      const fillVideos = ctx.options?.downloadVideos && ctx.missingVideos('saved') > 0;
      if (!cur.complete || fillVideos) {
        emit({ type: 'progress', message: fillVideos ? 'Fetching missing saved videos…' : cur.next_max_id ? 'Resuming saved from last marker…' : 'Importing saved posts…' });
        const r = await paginate(ctx, emit, {
          label: 'saved', buildUrl: url, pick, startMaxId: fillVideos ? null : cur.next_max_id,
          onPage: async (items, nextMaxId) => { await saveBatch(items); ctx.setCursor('saved', { next_max_id: nextMaxId, complete: nextMaxId ? 0 : 1 }); },
        });
        if (r.exhausted) ctx.setCursor('saved', { next_max_id: null, complete: 1, last_full_at: nowS() });
        emit({ type: 'done-section', message: `Saved posts: +${r.total} this run${r.exhausted ? ' — complete ✓' : ' — more remain, run again'}` });
      } else {
        emit({ type: 'progress', message: 'Checking for new saved posts…' });
        const seen = ctx.existingCodes('saved');
        const r = await paginate(ctx, emit, { label: 'saved', buildUrl: url, pick, stopOnSeen: (it) => seen.has(it.code), onPage: async (items) => { await saveBatch(items); } });
        emit({ type: 'done-section', message: `Saved posts: +${r.total} new` });
      }
    }

    // ── Followers / following — resumable snapshot; skip once complete (no redo) ──
    if (want('connections')) {
      for (const kind of ['followers', 'following']) {
        const cur = ctx.getCursor(kind);
        if (cur.complete) {
          emit({ type: 'done-section', message: `${kind}: already complete — skipping (no re-pull). Disconnect + re-sync to refresh.` });
          continue;
        }
        emit({ type: 'progress', message: cur.next_max_id ? `Resuming ${kind} from last marker…` : `Fetching ${kind}…` });
        const r = await paginate(ctx, emit, {
          label: kind, startMaxId: cur.next_max_id,
          buildUrl: (maxId) => `${BASE}/api/v1/friendships/${uid}/${kind}/?count=100${maxId ? `&max_id=${maxId}` : ''}`,
          pick: (d) => ({ items: d.users || [], nextMaxId: d.next_max_id || null }),
          onPage: async (users, nextMaxId) => { ctx.saveConnections(kind === 'followers' ? 'follower' : 'following', users.map(normalizeUser)); ctx.setCursor(kind, { next_max_id: nextMaxId, complete: nextMaxId ? 0 : 1 }); },
        });
        if (r.exhausted) ctx.setCursor(kind, { next_max_id: null, complete: 1, last_full_at: nowS() });
        emit({ type: 'done-section', message: `${kind}: +${r.total} this run${r.exhausted ? ' — complete ✓' : ' — more remain, run again to resume'}` });
      }
    }
  },

  // ── Direct messages: list inbox threads (for the picker) ─────────────────────
  async listDmThreads(ctx) {
    const p = pacingOf(ctx);
    const out = [];
    let cursor = null, page = 0;
    while (page < 30) {
      const url = `${BASE}/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&thread_message_limit=1&persistentBadging=true&limit=20${cursor ? `&cursor=${cursor}` : ''}`;
      const { status, data } = await ctx.fetch(url);
      if (status !== 200 || !data?.inbox) break;
      for (const t of data.inbox.threads || []) {
        const users = (t.users || []).map((u) => u.username).filter(Boolean);
        out.push({ thread_id: t.thread_id, title: t.thread_title || users.join(', ') || t.thread_id, users, last_activity_at: t.last_activity_at ? Math.floor(t.last_activity_at / 1000000) : null });
      }
      page++;
      if (!data.inbox.has_older || !data.inbox.oldest_cursor) break;
      cursor = data.inbox.oldest_cursor;
      await ctx.sleep(rand(p.pageMin, p.pageMax));
    }
    return out;
  },

  // ── Direct messages: pull SHARED MEDIA (reels/posts/stories/photos) from picks ─
  // Incremental: a per-thread marker (newest item_id last synced) lets re-runs
  // scan only new messages instead of the whole thread.
  async syncDmThreads(ctx, threadIds, emit) {
    const p = pacingOf(ctx);
    const seen = ctx.existingDmIds();
    const fileName = (s) => s.code || s.id.replace(/[:/]/g, '_');
    const dmCutoffTs = cutoffToTs(ctx.options?.cutoff); // honor date range for downloads
    let total = 0;
    for (const tid of threadIds) {
      const marker = ctx.getCursor(`dm:${tid}`).next_max_id; // newest item_id from last run
      emit({ type: 'progress', message: marker ? `Thread: checking for new shared media…` : `Thread: scanning for shared media…` });
      let cursor = null, page = 0, retries = 0, threadCount = 0, newestId = null, reached = false;
      while (page < 300 && !reached) {
        const url = `${BASE}/api/v1/direct_v2/threads/${tid}/?limit=20${cursor ? `&cursor=${cursor}` : ''}`;
        const { status, data, retryAfter } = await ctx.fetch(url);
        if (status === 429) {
          if (retries < 4) { const wait = retryAfter ? Math.min((parseInt(retryAfter, 10) || 0) * 1000, 300000) : rand(20000, 45000) * (retries + 1); emit({ type: 'warn', message: `thread: rate-limited — waiting ${Math.round(wait / 1000)}s` }); await ctx.sleep(wait); retries++; continue; }
          emit({ type: 'warn', message: 'thread: still limited — stopping (progress saved)' }); break;
        }
        if (status !== 200 || !data?.thread) { emit({ type: 'warn', message: `thread: HTTP ${status} — stopping` }); break; }
        retries = 0;
        const items = data.thread.items || [];
        if (!newestId && items[0]) newestId = items[0].item_id;
        const shared = [];
        for (const it of items) {
          if (marker && it.item_id === marker) { reached = true; break; } // caught up to last sync
          const m = extractShared(it, tid, ctx.accountId);
          if (m && !seen.has(m.id)) { shared.push(m); seen.add(m.id); }
        }
        for (const s of shared) {
          if (dmCutoffTs && s.shared_at && s.shared_at < dmCutoffTs) continue; // outside date range — keep the record, skip the bytes
          if (s.thumbnail_url) s.local_thumb = await ctx.downloadMedia(s.thumbnail_url, 'dm', `${fileName(s)}.jpg`);
          if (ctx.options?.downloadVideos && s.video_url) s.local_video = await ctx.downloadMedia(s.video_url, 'dm', `${fileName(s)}.mp4`);
        }
        if (shared.length) { ctx.saveDmShared(shared); threadCount += shared.length; total += shared.length; emit({ type: 'progress', message: `thread: +${threadCount} shared media…` }); }
        page++;
        if (reached || !data.thread.has_older || !data.thread.oldest_cursor) break;
        cursor = data.thread.oldest_cursor;
        await ctx.sleep(rand(p.pageMin, p.pageMax));
      }
      if (newestId) ctx.setCursor(`dm:${tid}`, { next_max_id: newestId, complete: 0 });
      emit({ type: 'done-section', message: `Thread done: +${threadCount} shared media` });
    }
    emit({ type: 'finished', message: `DMs: +${total} shared media from ${threadIds.length} thread(s)` });
    return total;
  },
});
