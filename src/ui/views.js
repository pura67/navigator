// Pure-ish render functions: given data (+ handlers), update the DOM. No app state.
import { $, esc, fmtDate } from './dom.js';

export const CATS = [
  { key: 'creators', label: 'Creators' },
  { key: 'posts', label: 'Posts' }, { key: 'reels', label: 'Reels' }, { key: 'saved', label: 'Saved' },
  { key: 'followers', label: 'Followers' }, { key: 'following', label: 'Following' }, { key: 'insights', label: 'Insights' },
  { key: 'dm', label: 'DM media' },
];
const COUNT_KEY = { creators: 'creators', posts: 'media', reels: 'reels', saved: 'saved', followers: 'followers', following: 'following', insights: 'insights', dm: 'dm' };
export const countFor = (sum, key) => sum?.[COUNT_KEY[key]] ?? 0;

export function renderRail(platforms, current, onSelect) {
  const nav = $('platforms');
  nav.innerHTML = '';
  for (const p of platforms) {
    const b = document.createElement('button');
    b.className = 'plat' + (p.id === current ? ' active' : '');
    b.disabled = !p.enabled;
    b.innerHTML = `<span>${esc(p.label)}</span>${p.enabled ? '' : '<span class="soon">soon</span>'}`;
    if (p.enabled) b.onclick = () => onSelect(p.id);
    nav.appendChild(b);
  }
}

export function renderAccounts(accounts, activeId) {
  $('acc-select').innerHTML = accounts
    .map((a) => `<option value="${a.id}"${a.id === activeId ? ' selected' : ''}>@${esc(a.username)}</option>`)
    .join('');
}

// Self profile: display picture + name + bio (from the captured account record).
export function renderProfile(account) {
  const a = account || {};
  const dp = $('acc-dp');
  dp.classList.add('hidden'); dp.removeAttribute('src'); // filled by app via authed fetchImage()
  $('acc-sub').textContent = (a.display_name || '') + (a.is_business ? ' · Pro' : '');
  $('acc-bio').textContent = a.bio || '';
}

export function renderScopes(scopes) {
  $('scopes').innerHTML = scopes
    .map((s) => `<label class="scope"><input type="checkbox" value="${esc(s.key)}" checked /> <span>${esc(s.label)}</span></label>`)
    .join('');
}

export function renderOverall(sum) {
  const o = sum?.percent?.overall ?? 0;
  $('overall').innerHTML = `<div class="ov-row"><span>Overall synced</span><b>${o}%</b></div><div class="bar big"><i style="width:${o}%"></i></div>`;
}

function statCell(label, n, pct, pend) {
  const sub = pct == null ? (pend ? `${pend} pending` : '—') : `${pct}%${pend ? ` · ${pend} left` : ''}`;
  const cls = pct === 100 ? 'done' : pend ? 'warn' : '';
  return `<div class="stat">
    <div class="n">${n ?? 0}</div><div class="k">${label}</div>
    <div class="bar"><i style="width:${pct == null ? 0 : pct}%"></i></div>
    <div class="sub ${cls}">${sub}</div></div>`;
}

export function renderStats(sum) {
  const s = sum || {}; const p = s.pending || {}; const pc = s.percent || {};
  const cells = [
    ['Posts + Reels', s.media, pc.media, p.media], ['Reels', s.reels, null, null], ['Insights', s.insights, pc.insights, p.insights],
    ['Saved', s.saved, pc.saved, null], ['Followers', s.followers, pc.followers, p.followers], ['Following', s.following, pc.following, p.following],
  ];
  $('stats').innerHTML = cells.map((c) => statCell(...c)).join('');
}

// Completed downloads (files actually on disk).
export function renderDownloads(sum) {
  const d = sum?.downloads;
  if (!d) { $('downloads').innerHTML = ''; return; }
  const line = (label, o) => `<div class="dl-row"><span>${label}</span><span><b>${o.videos}</b> videos · ${o.thumbs} images <span class="hint">of ${o.items}</span></span></div>`;
  $('downloads').innerHTML =
    `<div class="dl-total"><b>${d.totalVideos}</b> videos &amp; <b>${d.totalThumbs}</b> images downloaded to disk</div>`
    + line('Posts / Reels', d.media) + line('Saved', d.saved) + line('DM media', d.dm);
}

// Explorer: creators (owners) you've collected media from.
export function renderCreators(creators) {
  const el = $('list');
  if (!creators || !creators.length) { el.innerHTML = '<div class="empty">No creators yet — sync Saved or DM media, then come back.</div>'; return; }
  el.innerHTML = creators.map((c) => `
    <div class="li clickable" data-creator="${esc(c.username)}">
      <div class="li-main"><div class="li-1">@${esc(c.username)}</div>
        <div class="li-2">${c.reels} reels · <b>${c.videos}</b> downloaded · ${c.dm} from DM / ${c.saved} saved</div></div>
      <div class="li-meta">${c.items}</div>
    </div>`).join('');
}

export function renderCreatorItems(username, rows) {
  const el = $('list');
  const back = `<div class="li clickable creator-back" data-back="1"><div class="li-main"><div class="li-1">‹ All creators</div><div class="li-2">@${esc(username)} — ${rows.length} item(s)</div></div></div>`;
  if (!rows.length) { el.innerHTML = back + '<div class="empty">Nothing.</div>'; return; }
  const body = rows.map((r) => row(
    `${r.local_video ? '▶ ' : ''}/${esc(r.code) || '?'} <span class="muted">${esc(r.src)}${r.item_type ? ' · ' + esc(r.item_type) : ''}</span>`,
    esc(r.caption), '',
    r.permalink || (r.code ? `${IG}/p/${r.code}/` : null), r.local_video || null,
  )).join('');
  el.innerHTML = back + body;
}

export function renderTabs(sum, activeCat, onTab) {
  $('tabs').innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.className = 'tab' + (c.key === activeCat ? ' active' : '');
    b.innerHTML = `${esc(c.label)} <span class="badge">${countFor(sum, c.key)}</span>`;
    b.onclick = () => onTab(c.key);
    $('tabs').appendChild(b);
  }
}

const IG = 'https://www.instagram.com';
const row = (primary, secondary, meta, href, local) => {
  const click = href || local;
  return `<div class="li${click ? ' clickable' : ''}"${href ? ` data-href="${esc(href)}"` : ''}${local ? ` data-local="${esc(local)}"` : ''}>`
    + `<div class="li-main"><div class="li-1">${primary}</div><div class="li-2">${secondary || ''}</div></div>`
    + `<div class="li-meta">${meta || ''}</div></div>`;
};

export function renderList(key, rows) {
  const el = $('list');
  if (!rows || !rows.length) { el.innerHTML = '<div class="empty">Nothing here yet — run a sync.</div>'; return; }
  let html = '';
  if (key === 'posts' || key === 'reels') {
    html = rows.map((r) => {
      const isVideo = r.media_type === 2 || r.product_type === 'clips' || r.video_url;
      return row(
        `${isVideo ? '▶ ' : ''}${esc(r.caption) || `<span class="muted">/${esc(r.code)}</span>`}`,
        `${esc(r.product_type) || 'type ' + r.media_type} · /${esc(r.code)}${r.local_video ? ' · ⤓ saved' : ''}`,
        `♥ ${r.like_count ?? '-'} · 💬 ${r.comment_count ?? '-'}${r.view_count ? ' · ▶ ' + r.view_count : ''}<br>${fmtDate(r.taken_at)}`,
        r.permalink || `${IG}/p/${r.code}/`, r.local_video || null,
      );
    }).join('');
  } else if (key === 'saved') {
    html = rows.map((r) => row(`${r.local_video ? '▶ ' : ''}@${esc(r.owner_username) || '?'}`, esc(r.caption), `/${esc(r.code)}`, r.permalink || `${IG}/p/${r.code}/`, r.local_video || null)).join('');
  } else if (key === 'followers' || key === 'following') {
    html = rows.map((r) => row(`@${esc(r.username)}${r.is_verified ? ' ✔' : ''}`, esc(r.full_name), r.is_private ? '🔒 private' : '', `${IG}/${esc(r.username)}/`)).join('');
  } else if (key === 'insights') {
    html = rows.map((r) => row(`/${esc(r.code)}`, esc(r.caption), '', `${IG}/p/${r.code}/`)).join('');
  } else if (key === 'dm') {
    html = rows.map((r) => row(
      `${r.local_video ? '▶ ' : ''}@${esc(r.owner_username) || '?'} <span class="muted">${esc(r.item_type)}</span>`,
      esc(r.caption), r.code ? `/${esc(r.code)}` : '',
      r.permalink || (r.code ? `${IG}/p/${r.code}/` : null), r.local_video || null,
    )).join('');
  }
  el.innerHTML = html + (rows.length >= 300 ? '<div class="empty">Showing first 300.</div>' : '');
}

// ── destinations (remote sinks) ──
export function renderDestinations(list) {
  const el = $('dests');
  if (!list || !list.length) { el.innerHTML = '<div class="empty">No destinations yet — add one below.</div>'; return; }
  el.innerHTML = list.map((d) => `
    <div class="dest" data-id="${d.id}">
      <div class="dest-main">
        <div class="dest-1">${esc(d.name)} <span class="muted">· ${esc(d.type)}</span>${d.enabled ? '' : ' <span class="muted">(off)</span>'}</div>
        <div class="dest-2 hint">${d.last_status ? `last push: ${esc(d.last_status)}${d.last_push_at ? ' · ' + fmtDate(d.last_push_at) : ''}` : 'never pushed'}</div>
      </div>
      <div class="dest-actions">
        <button data-act="push" data-id="${d.id}" class="primary">Push now</button>
        <button data-act="test" data-id="${d.id}">Test</button>
        <button data-act="edit" data-id="${d.id}">Edit</button>
        <button data-act="del" data-id="${d.id}" class="danger">Remove</button>
      </div>
    </div>`).join('');
}

function fieldHtml(f, val) {
  const id = `df-f-${f.key}`;
  if (f.type === 'checkbox') {
    const on = (val === undefined ? f.default : val) ? ' checked' : '';
    return `<label class="df df-check"><input type="checkbox" id="${id}" data-key="${esc(f.key)}"${on} /> <span>${esc(f.label)}</span></label>`;
  }
  if (f.type === 'textarea')
    return `<label class="df">${esc(f.label)}<textarea id="${id}" data-key="${esc(f.key)}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(val || '')}</textarea></label>`;
  const t = f.type === 'password' ? 'password' : 'text';
  return `<label class="df">${esc(f.label)}${f.required ? ' *' : ''}<input type="${t}" id="${id}" data-key="${esc(f.key)}" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}" /></label>`;
}

export function renderDestForm(types, existing) {
  const cur = existing || { type: types[0].id, config: {}, name: '' };
  const spec = types.find((t) => t.id === cur.type) || types[0];
  $('dest-form').innerHTML = `
    <input type="hidden" id="dest-id" value="${existing?.id || ''}" />
    <label class="df">Name <input id="df-name" value="${esc(cur.name || '')}" placeholder="My destination" /></label>
    <label class="df">Type <select id="df-type">${types.map((t) => `<option value="${t.id}"${t.id === cur.type ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
    <p class="hint">${esc(spec.blurb)}</p>
    <div id="df-fields">${spec.fields.map((f) => fieldHtml(f, cur.config[f.key])).join('')}</div>
    <div class="dest-form-bar">
      <button id="df-save" class="primary">Save</button>
      <button id="df-test">Test connection</button>
      <button id="df-cancel">Cancel</button>
      <span id="df-msg" class="hint"></span>
    </div>`;
}

export function renderDmThreads(threads) {
  const wrap = $('dm-threads');
  if (!threads || !threads.length) { wrap.innerHTML = '<div class="empty">No threads found.</div>'; return; }
  wrap.innerHTML = threads
    .map((t) => `<label class="dm-thread"><input type="checkbox" value="${esc(t.thread_id)}" /> <span class="dm-title">${esc(t.title)}</span></label>`)
    .join('');
}
