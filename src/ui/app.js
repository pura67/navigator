// Renderer orchestrator: holds UI state, talks to the main process via window.api,
// and drives the view layer (views.js). Loaded as an ES module.
import { $ } from './dom.js';
import * as V from './views.js';

const state = { platforms: [], current: null, accounts: [], activeAccountId: null, busy: false, lastSummary: null, activeCat: null };

const CONNECT_COPY = {
  instagram: 'Sign in to your own Instagram account in a normal login window. Nothing is sent anywhere — cookies and data stay on this machine.',
};

const hasData = (s) => !!s && ((s.media || 0) + (s.saved || 0) + (s.followers || 0) + (s.following || 0) + (s.insights || 0)) > 0;
const selectedScopes = () => [...document.querySelectorAll('#scopes input:checked')].map((i) => i.value);

function logLine(p) {
  const log = $('log');
  const cls = p.type === 'warn' ? 'warn' : p.type === 'error' ? 'err' : (p.type === 'finished' || p.type === 'done-section') ? 'ok' : '';
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = `• ${p.message}\n`;
  log.appendChild(span);
  log.scrollTop = log.scrollHeight;
}

function setBusy(b) {
  state.busy = b;
  const has = hasData(state.lastSummary);
  $('btn-sync').disabled = b;
  $('btn-sync').textContent = b ? (has ? 'Syncing…' : 'Importing…') : (has ? 'Sync now' : 'Import data');
}

async function selectPlatform(id) {
  state.current = id;
  const p = state.platforms.find((x) => x.id === id);
  $('title').textContent = p.label;
  V.renderRail(state.platforms, id, selectPlatform);

  state.accounts = await window.api.accountsList(id);
  const connected = state.accounts.length > 0;
  $('status').textContent = connected ? 'connected' : 'not connected';
  $('status').className = 'pill' + (connected ? ' on' : '');
  $('connect-copy').textContent = CONNECT_COPY[id] || `Sign in to your own ${p.label} account.`;
  $('btn-login').textContent = `Connect ${p.label}`;
  $('connect').classList.toggle('hidden', connected);
  $('workspace').classList.toggle('hidden', !connected);
  $('dm-card').classList.toggle('hidden', !(connected && p.dm));

  if (connected) {
    if (!state.accounts.some((a) => a.id === state.activeAccountId)) state.activeAccountId = state.accounts[0].id;
    V.renderScopes(p.scopes);
    await loadAccount();
  }
}

async function loadAccount() {
  const sum = await window.api.summary(state.current, state.activeAccountId);
  state.lastSummary = sum;
  V.renderAccounts(state.accounts, state.activeAccountId);
  V.renderProfile(sum?.account);
  const pic = sum?.account?.profile_pic;
  if (pic) window.api.fetchImage(state.current, state.activeAccountId, pic).then((durl) => {
    if (!durl) return;
    const dp = $('acc-dp'); dp.src = durl; dp.classList.remove('hidden');
  });
  V.renderOverall(sum);
  V.renderStats(sum);
  V.renderDownloads(sum);
  V.renderTabs(sum, state.activeCat, loadCategory);
  setBusy(false);
  loadCategory(state.activeCat || V.CATS.find((c) => c.key !== 'creators' && V.countFor(sum, c.key) > 0)?.key || 'posts');
}

async function loadCategory(key) {
  state.activeCat = key;
  V.renderTabs(state.lastSummary, key, loadCategory);
  $('list').innerHTML = '<div class="empty">Loading…</div>';
  if (key === 'creators') { V.renderCreators(await window.api.creators(state.current, state.activeAccountId)); return; }
  V.renderList(key, await window.api.listItems(state.current, key, state.activeAccountId));
}

async function loadCreator(username) {
  $('list').innerHTML = '<div class="empty">Loading…</div>';
  V.renderCreatorItems(username, await window.api.byCreator(state.current, state.activeAccountId, username));
}

// ── event wiring ──
$('btn-login').onclick = async () => {
  $('btn-login').disabled = true;
  const r = await window.api.login(state.current, false);
  $('btn-login').disabled = false;
  if (r.status === 'connected') { state.activeAccountId = r.accountId; selectPlatform(state.current); }
  else if (r.status === 'error') alert('Login failed: ' + r.error);
};

$('btn-add').onclick = async () => {
  const r = await window.api.login(state.current, true);
  if (r.status === 'connected') {
    state.accounts = await window.api.accountsList(state.current);
    state.activeAccountId = r.accountId;
    state.activeCat = null;
    await loadAccount();
  } else if (r.status === 'error') alert('Login failed: ' + r.error);
};

$('acc-select').onchange = (e) => { state.activeAccountId = Number(e.target.value); state.activeCat = null; loadAccount(); };

$('btn-sync').onclick = async () => {
  if (state.busy) return;
  const scope = selectedScopes();
  if (!scope.length) return alert('Pick at least one data type.');
  $('log').innerHTML = '';
  setBusy(true);
  const r = await window.api.sync(state.current, scope, state.activeAccountId);
  if (r.status === 'ok') {
    state.lastSummary = r.summary;
    V.renderOverall(r.summary);
    V.renderStats(r.summary);
    V.renderDownloads(r.summary);
    V.renderTabs(r.summary, state.activeCat, loadCategory);
    if (state.activeCat) loadCategory(state.activeCat);
  }
  setBusy(false);
};

$('btn-export').onclick = async () => {
  const r = await window.api.exportData(state.current, state.activeAccountId);
  if (r.status === 'ok') logLine({ type: 'finished', message: 'Exported → ' + r.filePath });
};
$('btn-folder').onclick = () => window.api.openDataDir();
$('btn-disconnect').onclick = async () => {
  if (!confirm('Disconnect this account and clear its session? Its synced data stays on disk.')) return;
  await window.api.disconnect(state.current, state.activeAccountId);
  state.activeAccountId = null; state.activeCat = null;
  selectPlatform(state.current);
};

$('opt-videos').onchange = (e) => window.api.setSetting('downloadVideos', e.target.checked ? '1' : '0');
$('opt-pacing').onchange = (e) => window.api.setSetting('pacing', e.target.value);
$('opt-cutoff').onchange = (e) => {
  const v = e.target.value;
  const dateEl = $('opt-cutoff-date');
  dateEl.classList.toggle('hidden', v !== 'custom');
  if (v === 'custom') { if (dateEl.value) window.api.setSetting('cutoff', dateEl.value); }
  else window.api.setSetting('cutoff', v);
};
$('opt-cutoff-date').onchange = (e) => { if (e.target.value) window.api.setSetting('cutoff', e.target.value); };

$('list').onclick = (e) => {
  if (e.target.closest('[data-back]')) { loadCategory('creators'); return; }
  const cr = e.target.closest('[data-creator]');
  if (cr) { loadCreator(cr.dataset.creator); return; }
  const r = e.target.closest('.li.clickable');
  if (!r) return;
  if (r.dataset.local) window.api.openPath(r.dataset.local).then((err) => { if (err) logLine({ type: 'error', message: `Can't open local file: ${err}` }); });
  else if (r.dataset.href) window.api.openUrl(r.dataset.href);
};

// ── DM picker ──
const dmChecks = () => [...document.querySelectorAll('#dm-threads input')];
function updateDmCount() { $('dm-count').textContent = `${dmChecks().filter((i) => i.checked).length} selected`; }
$('btn-dm-load').onclick = async () => {
  $('btn-dm-load').disabled = true; $('btn-dm-load').textContent = 'Loading…';
  const r = await window.api.dmThreads(state.current, state.activeAccountId);
  $('btn-dm-load').disabled = false; $('btn-dm-load').textContent = 'Reload DM threads';
  if (r.status === 'error') return alert('DM load failed: ' + r.error);
  V.renderDmThreads(r.threads);
  $('dm-pick').classList.remove('hidden'); $('btn-dm-sync').classList.remove('hidden');
  updateDmCount();
};
$('dm-all').onclick = () => { dmChecks().forEach((i) => { i.checked = true; }); updateDmCount(); };
$('dm-none').onclick = () => { dmChecks().forEach((i) => { i.checked = false; }); updateDmCount(); };
$('dm-threads').onchange = updateDmCount;
$('btn-dm-sync').onclick = async () => {
  const ids = dmChecks().filter((i) => i.checked).map((i) => i.value);
  if (!ids.length) return alert('Pick at least one thread.');
  $('log').innerHTML = '';
  $('btn-dm-sync').disabled = true; $('btn-dm-sync').textContent = 'Syncing…';
  const r = await window.api.dmSync(state.current, state.activeAccountId, ids);
  $('btn-dm-sync').disabled = false; $('btn-dm-sync').textContent = 'Sync shared media';
  if (r.status === 'ok' && r.summary) {
    state.lastSummary = r.summary;
    V.renderStats(r.summary);
    V.renderDownloads(r.summary);
    V.renderTabs(r.summary, state.activeCat, loadCategory);
    if (state.activeCat === 'dm') loadCategory('dm');
  }
};

// ── destinations (remote sinks) ──
async function loadDestinations() {
  if (!state.destTypes) state.destTypes = await window.api.destinationTypes();
  state.dests = await window.api.destinations();
  V.renderDestinations(state.dests);
}

function collectDest() {
  const type = $('df-type').value;
  const config = {};
  document.querySelectorAll('#df-fields [data-key]').forEach((el) => {
    config[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });
  return { id: $('dest-id').value ? Number($('dest-id').value) : undefined, name: ($('df-name').value.trim() || type), type, config, enabled: true };
}

function wireDestForm() {
  $('df-type').onchange = () => {
    openDestForm({ id: $('dest-id').value ? Number($('dest-id').value) : undefined, type: $('df-type').value, name: $('df-name').value, config: {} });
  };
  $('df-cancel').onclick = () => $('dest-form').classList.add('hidden');
  const connectBtn = document.getElementById('df-connect');
  if (connectBtn) connectBtn.onclick = async () => {
    const clientId = document.getElementById('df-f-clientId')?.value.trim();
    const clientSecret = document.getElementById('df-f-clientSecret')?.value.trim();
    const status = document.getElementById('df-connect-status');
    if (!clientId || !clientSecret) { status.textContent = 'enter client ID + secret first'; return; }
    status.textContent = 'opening Google sign-in…';
    const r = await window.api.connectDrive(clientId, clientSecret);
    if (r.ok) { document.getElementById('df-f-refreshToken').value = r.refreshToken; status.textContent = '✓ connected'; }
    else status.textContent = '✗ ' + r.error;
  };
  $('df-test').onclick = async () => {
    const d = collectDest();
    $('df-msg').textContent = 'Testing…';
    const r = await window.api.testDestination({ type: d.type, config: d.config });
    $('df-msg').textContent = r.ok ? `✓ ${r.type ? r.type + ' · ' : ''}reachable ${r.detail || ''}` : `✗ ${r.error}`;
  };
  $('df-save').onclick = async () => {
    const d = collectDest();
    const r = await window.api.saveDestination(d);
    if (r && r.ok === false) { $('df-msg').textContent = '✗ ' + r.error; return; }
    $('dest-form').classList.add('hidden');
    loadDestinations();
  };
}

function openDestForm(existing) {
  V.renderDestForm(state.destTypes, existing);
  $('dest-form').classList.remove('hidden');
  wireDestForm();
}

$('btn-dest-add').onclick = () => openDestForm(null);
$('dests').onclick = async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = Number(b.dataset.id);
  const d = state.dests.find((x) => x.id === id);
  const act = b.dataset.act;
  if (act === 'edit') return openDestForm(d);
  if (act === 'del') { if (confirm(`Remove “${d.name}”?`)) { await window.api.deleteDestination(id); loadDestinations(); } return; }
  if (act === 'test') {
    logLine({ type: '', message: `Testing “${d.name}”…` });
    const r = await window.api.testDestination({ id });
    logLine(r.ok ? { type: 'finished', message: `“${d.name}” reachable ${r.detail || ''}` } : { type: 'error', message: `“${d.name}”: ${r.error}` });
    return;
  }
  if (act === 'push') {
    if (!state.activeAccountId) return alert('Connect an account first.');
    b.disabled = true;
    $('log').innerHTML = '';
    const r = await window.api.pushTo(state.current, state.activeAccountId, id, { full: $('dest-full').checked });
    b.disabled = false;
    if (r.status === 'error') logLine({ type: 'error', message: `Push failed: ${r.error}` });
    loadDestinations();
  }
};
window.api.onPushProgress((p) => logLine(p));

window.api.onProgress((p) => { if (p.platform === state.current) logLine(p); });
window.api.onConnected((p) => {
  if (p.platform !== state.current) return;
  window.api.accountsList(state.current).then((a) => { state.accounts = a; V.renderAccounts(a, state.activeAccountId); });
});

// ── boot ──
(async () => {
  const settings = await window.api.getSettings();
  $('opt-videos').checked = settings.downloadVideos === '1';
  $('opt-pacing').value = settings.pacing || 'balanced';
  const cutoff = settings.cutoff || 'all';
  if (/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) { $('opt-cutoff').value = 'custom'; $('opt-cutoff-date').value = cutoff; $('opt-cutoff-date').classList.remove('hidden'); }
  else $('opt-cutoff').value = cutoff;
  state.platforms = await window.api.listPlatforms();
  const first = state.platforms.find((p) => p.enabled) || state.platforms[0];
  V.renderRail(state.platforms, first?.id, selectPlatform);
  if (first) selectPlatform(first.id);
  loadDestinations();
})();
