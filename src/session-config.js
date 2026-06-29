// Make each account's Electron session look like a normal desktop Chrome, not
// Electron. The default Electron UA contains "self-sync/x.y … Electron/34" which
// is an obvious automation signal to Instagram's bot detection. We set a clean
// Chrome UA (+ Accept-Language) on the session so the login window, the hidden
// API window, and net.fetch (media/profile) all present consistently.
import { session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Main-world script that hides Electron/automation from a page's JS
// (navigator.webdriver + userAgentData). Loaded by the login + hidden API windows.
export const STEALTH_PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'stealth-preload.cjs');

// Keep this reasonably current; a stale Chrome version is itself a mild signal.
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
// Client-hint brands that MATCH the UA above and contain NO "Electron" entry.
// Electron's default sec-ch-ua advertises `"Electron";v="34"` — an instant
// automation tell for Instagram even when the UA string is a clean Chrome.
const SEC_CH_UA = '"Not A(Brand";v="99", "Google Chrome";v="132", "Chromium";v="132"';

const tuned = new Set();

// Return the partition's session with the Chrome UA + matching client hints
// applied (idempotent). Rewriting the sec-ch-ua* headers on every request hides
// the Electron brand that bot detection keys on.
export function tunedSession(partition) {
  const sess = session.fromPartition(partition);
  if (!tuned.has(partition)) {
    sess.setUserAgent(UA, 'en-US,en;q=0.9');
    sess.webRequest.onBeforeSendHeaders((details, cb) => {
      const h = details.requestHeaders;
      h['sec-ch-ua'] = SEC_CH_UA;
      h['sec-ch-ua-mobile'] = '?0';
      h['sec-ch-ua-platform'] = '"macOS"';
      cb({ requestHeaders: h });
    });
    tuned.add(partition);
  }
  return sess;
}

// Apply the UA to a window's webContents too (covers navigator.userAgent seen by
// page JS, not just the network header).
export function tuneWindow(win) {
  win.webContents.setUserAgent(UA);
}
