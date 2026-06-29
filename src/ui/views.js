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

// GitHub-style heatmap of saved reels per day (by post date). Ported from chinup.
export function renderSavedHeatmap(data) {
  const host = $('heatmap');
  if (!host) return;
  if (!data || !data.rows || !data.rows.length || !data.start) {
    host.innerHTML = '<div class="empty">No saved reels yet — sync Saved (with a date range) to see your activity.</div>';
    return;
  }
  const byDay = new Map(data.rows.map((r) => [r.day, r.total]));
  const maxN = data.maxN || 1;
  const winStart = new Date(data.start + 'T00:00:00');
  const winEnd = new Date(data.end + 'T00:00:00');
  const gridStart = new Date(winStart);
  while (gridStart.getDay() !== 0) gridStart.setDate(gridStart.getDate() - 1);
  const weeks = Math.ceil((Math.ceil((winEnd - gridStart) / 86400000) + 1) / 7);
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const level = (n) => (!n ? 0 : maxN <= 4 ? Math.min(4, n) : n >= maxN * 0.75 ? 4 : n >= maxN * 0.5 ? 3 : n >= maxN * 0.25 ? 2 : 1);

  const flat = [];
  for (let d = 0; d < 7; d++) {
    for (let w = 0; w < weeks; w++) {
      const date = new Date(gridStart.getTime() + (w * 7 + d) * 86400000);
      if (date < winStart || date > winEnd) { flat.push('<div class="hm-cell hm-empty"></div>'); continue; }
      const key = dayKey(date);
      const n = byDay.get(key) || 0;
      flat.push(`<div class="hm-cell hm-lv${level(n)}" title="${esc(key)}: ${n} saved reel${n === 1 ? '' : 's'}"></div>`);
    }
  }
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const fd = new Date(gridStart.getTime() + w * 7 * 86400000);
    if (fd.getMonth() !== lastMonth) { monthLabels.push({ w, label: fd.toLocaleString('en', { month: 'short' }) }); lastMonth = fd.getMonth(); }
  }
  const wd = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  host.innerHTML = `
    <div class="hm-head">
      <div class="hm-title">${data.total} saved reel${data.total === 1 ? '' : 's'} · ${esc(data.start)} → ${esc(data.end)} <span class="hint">(by post date)</span></div>
      <div class="hm-legend"><span>Less</span><span class="hm-cell hm-lv0"></span><span class="hm-cell hm-lv1"></span><span class="hm-cell hm-lv2"></span><span class="hm-cell hm-lv3"></span><span class="hm-cell hm-lv4"></span><span>More</span></div>
    </div>
    <div class="hm-grid-wrap" style="--hm-weeks:${weeks}">
      <div class="hm-months">${monthLabels.map((m) => `<span style="grid-column:${m.w + 1} / span 4">${m.label}</span>`).join('')}</div>
      <div class="hm-body"><div class="hm-weekdays">${wd.map((l) => `<span>${l}</span>`).join('')}</div><div class="hm-grid">${flat.join('')}</div></div>
    </div>`;
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
export const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
};

export function renderDestinations(list) {
  const el = $('dests');
  if (!list || !list.length) { el.innerHTML = '<div class="empty">No destinations yet — add one below.</div>'; return; }
  el.innerHTML = list.map((d) => `
    <div class="dest" data-id="${d.id}">
      <div class="dest-main">
        <div class="dest-1">${esc(d.name)} <span class="muted">· ${esc(d.type)}${d.content ? ' · ' + esc(d.content) : ''}</span>${d.enabled ? '' : ' <span class="muted">(off)</span>'}</div>
        <div class="dest-2 hint"><span class="dest-pending" data-id="${d.id}">…</span><span class="dest-last" data-id="${d.id}"></span></div>
      </div>
      <div class="dest-actions">
        <button data-act="push" data-id="${d.id}" class="primary">Push now</button>
        <button data-act="test" data-id="${d.id}">Test</button>
        <button data-act="hist" data-id="${d.id}">History</button>
        <button data-act="edit" data-id="${d.id}">Edit</button>
        <button data-act="del" data-id="${d.id}" class="danger">Remove</button>
      </div>
      <div class="dest-history hidden" data-id="${d.id}"></div>
    </div>`).join('');
}

// Fill a destination row's "X new · Y pending" diff + last-run summary (async).
export function setDestPending(id, preview) {
  const el = document.querySelector(`.dest-pending[data-id="${id}"]`);
  if (!el) return;
  if (!preview || preview.error) { el.textContent = ''; return; }
  el.innerHTML = preview.items > 0
    ? `<b class="pending">${preview.items} new</b> · ${fmtBytes(preview.bytes)} pending`
    : '<span class="ok">up to date ✓</span>';
}
export function setDestLast(id, runs) {
  const el = document.querySelector(`.dest-last[data-id="${id}"]`);
  if (!el) return;
  const r = runs && runs[0];
  el.textContent = r ? ` · last: ${r.items} items · ${fmtBytes(r.bytes)} · ${fmtDate(r.finished_at)}${r.status === 'ok' ? '' : ' (failed)'}` : ' · never pushed';
}

// Live push progress into #push-panel (bar + speed + counts + ETA).
export function renderPushProgress(name, p, speedBps) {
  const el = $('push-panel'); if (!el) return;
  el.classList.remove('hidden');
  const total = p.total || 0, sent = p.sent || 0;
  const bytes = p.bytes || 0, totalBytes = p.totalBytes || 0;
  const pct = total ? Math.min(100, Math.round((sent / total) * 100)) : (p.type === 'finished' ? 100 : 0);
  let head, meta, cls = '';
  if (p.type === 'finished') { head = `✓ ${esc(name)} — done`; meta = esc(p.message || ''); cls = 'pp-ok'; }
  else if (p.type === 'error') { head = `✗ ${esc(name)} — failed`; meta = esc(p.message || ''); cls = 'pp-err'; }
  else {
    const speed = speedBps ? `${fmtBytes(speedBps)}/s` : '';
    const eta = (speedBps && totalBytes > bytes) ? `ETA ${Math.max(1, Math.round((totalBytes - bytes) / speedBps))}s` : '';
    head = `Pushing to ${esc(name)} — ${sent}/${total || '?'}`;
    meta = [speed, totalBytes ? `${fmtBytes(bytes)} / ${fmtBytes(totalBytes)}` : (bytes ? fmtBytes(bytes) : ''), eta].filter(Boolean).join(' · ');
  }
  el.innerHTML = `<div class="pp-head ${cls}">${head}</div><div class="bar big"><i style="width:${pct}%"></i></div><div class="pp-meta hint">${meta}</div>`;
}

export function renderDestHistory(id, runs) {
  const el = document.querySelector(`.dest-history[data-id="${id}"]`);
  if (!el) return;
  el.classList.toggle('hidden');
  if (el.classList.contains('hidden')) return;
  el.innerHTML = (!runs || !runs.length)
    ? '<div class="hint">No pushes yet.</div>'
    : '<table class="hist"><tr><th>When</th><th>Items</th><th>Size</th><th></th></tr>'
      + runs.map((r) => `<tr><td>${fmtDate(r.finished_at)}</td><td>${r.items}</td><td>${fmtBytes(r.bytes)}</td><td class="${r.status === 'ok' ? 'ok' : 'err'}">${r.status === 'ok' ? '✓' : '✗'}</td></tr>`).join('')
      + '</table>';
}

function fieldHtml(f, val) {
  const id = `df-f-${f.key}`;
  if (f.type === 'checkbox') {
    const on = (val === undefined ? f.default : val) ? ' checked' : '';
    return `<label class="df df-check"><input type="checkbox" id="${id}" data-key="${esc(f.key)}"${on} /> <span>${esc(f.label)}</span></label>`;
  }
  if (f.type === 'textarea')
    return `<label class="df">${esc(f.label)}<textarea id="${id}" data-key="${esc(f.key)}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(val || '')}</textarea></label>`;
  if (f.type === 'select') {
    const cur = val === undefined ? f.default : val;
    const opts = (f.options || []).map((o) => `<option value="${esc(o.value)}"${o.value === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    return `<label class="df">${esc(f.label)}<select id="${id}" data-key="${esc(f.key)}">${opts}</select></label>`;
  }
  if (f.type === 'connect') {
    const on = !!val;
    return `<div class="df df-connect"><input type="hidden" id="${id}" data-key="${esc(f.key)}" value="${esc(val || '')}" />
      <button type="button" id="df-connect">${on ? 'Reconnect Google Drive' : 'Connect Google Drive'}</button>
      <span id="df-connect-status" class="hint">${on ? '✓ connected' : 'not connected'}</span></div>`;
  }
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
