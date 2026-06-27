// Make each account's Electron session look like a normal desktop Chrome, not
// Electron. The default Electron UA contains "self-sync/x.y … Electron/34" which
// is an obvious automation signal to Instagram's bot detection. We set a clean
// Chrome UA (+ Accept-Language) on the session so the login window, the hidden
// API window, and net.fetch (media/profile) all present consistently.
import { session } from 'electron';

// Keep this reasonably current; a stale Chrome version is itself a mild signal.
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

const tuned = new Set();

// Return the partition's session with the Chrome UA applied (idempotent).
export function tunedSession(partition) {
  const sess = session.fromPartition(partition);
  if (!tuned.has(partition)) {
    sess.setUserAgent(UA, 'en-US,en;q=0.9');
    tuned.add(partition);
  }
  return sess;
}

// Apply the UA to a window's webContents too (covers navigator.userAgent seen by
// page JS, not just the network header).
export function tuneWindow(win) {
  win.webContents.setUserAgent(UA);
}
