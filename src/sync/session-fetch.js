// Same-origin fetch via a hidden, logged-in BrowserWindow.
//
// This is the heart of the syncer (lifted from chinup's LinkedIn approach):
// instead of forging requests from Node — which platforms flag — we keep a
// hidden window parked on the platform's own logged-in page and run fetch()
// *inside that page* via executeJavaScript. Requests are therefore same-origin,
// carry the session cookies natively, and look identical to the website's own
// XHRs. httpOnly tokens are read from the main-process session and injected as
// headers by the adapter's buildHeaders().

import { BrowserWindow } from 'electron';
import { tunedSession, tuneWindow } from '../session-config.js';

const apiWindows = new Map(); // partition -> BrowserWindow

async function getApiWindow(partition, adapter) {
  const existing = apiWindows.get(partition);
  if (existing && !existing.isDestroyed()) return existing;

  const sess = tunedSession(partition);
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: { session: sess, contextIsolation: false, sandbox: false },
  });
  tuneWindow(win);
  win.on('closed', () => apiWindows.delete(partition));
  apiWindows.set(partition, win);

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('api window load timeout')), 30000);
    win.webContents.once('did-finish-load', () => { clearTimeout(t); resolve(); });
    win.webContents.once('did-fail-load', (_e, code, desc) => { clearTimeout(t); reject(new Error(`api window load failed: ${desc} (${code})`)); });
    win.loadURL(adapter.homeUrl);
  });
  return win;
}

export async function cookieMap(partition, cookieDomain) {
  const sess = tunedSession(partition);
  const cookies = await sess.cookies.get({ domain: cookieDomain });
  const map = {};
  for (const c of cookies) map[c.name] = c.value;
  return map;
}

// Run `fetch(url)` inside the logged-in page (of a specific account partition).
export async function sessionFetch(partition, adapter, url, opts = {}) {
  const win = await getApiWindow(partition, adapter);
  const cookies = await cookieMap(partition, adapter.cookieDomain);
  const headers = { Accept: 'application/json', ...adapter.buildHeaders(cookies), ...(opts.headers || {}) };
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.stringify(opts.body) : null;

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const r = await fetch(${JSON.stringify(url)}, {
          method: ${JSON.stringify(method)},
          credentials: 'include',
          headers: ${JSON.stringify(headers)},
          ${body ? `body: ${JSON.stringify(body)},` : ''}
        });
        const text = await r.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        return { status: r.status, data, raw: data ? null : text.slice(0, 300), retryAfter: r.headers.get('retry-after') };
      } catch (e) { return { status: 0, error: String(e) }; }
    })()
  `, true);
  return result;
}

export function closeApiWindows() {
  for (const w of apiWindows.values()) if (!w.isDestroyed()) w.destroy();
  apiWindows.clear();
}
