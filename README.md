# Self Sync

A thin, installable desktop app that logs into **your own** social accounts and
pulls **your own** data — 100% locally. No backend, no servers, nothing leaves
the machine. Built to mirror the chinup Electron approach.

**Status:** Instagram works end-to-end. YouTube + TikTok are scaffolded stubs.

## How it works

1. You click **Connect Instagram** → a real Instagram login window opens (its own
   isolated Electron session). You log in like normal.
2. On success, the session cookies are captured locally.
3. A **hidden window stays parked on instagram.com** and runs the data fetches
   *from inside that logged-in page* (`fetch('/api/v1/...')` via `executeJavaScript`).
   Requests are same-origin with the real browser fingerprint — no header forgery,
   no datacenter rate-limit walls.
4. Results land in a local **SQLite** DB + media files on disk. Export to JSON anytime.

This same-origin-hidden-window trick is the whole reason it's reliable; it's lifted
straight from `products/chinup/electron/src/main.js`.

## Instagram — what it pulls (your account only)

| Scope | Endpoint | Notes |
|-------|----------|-------|
| Posts + Reels + profile | `/api/v1/users/{uid}/info/`, `/api/v1/feed/user/{uid}/` | captions, counts, thumbnails (videos optional) |
| Insights / analytics | `/api/v1/media/{id}/insights/` | best-effort; needs a Pro/Creator account |
| Saved posts | `/api/v1/feed/saved/posts/` | |
| Followers / following | `/api/v1/friendships/{uid}/{followers,following}/` | paginated; most rate-limit-sensitive |

## Run

```bash
cd personal/self-sync
npm install            # postinstall runs electron-rebuild for better-sqlite3
npm start
```

If `better-sqlite3` complains about ABI/native build: `npm run rebuild`.

## Package (installable)

```bash
npm run dist:mac      # → dist/*.dmg     (also dist:win / dist:linux)
```

## Where data lives

Everything is under Electron's `userData` dir:
- macOS: `~/Library/Application Support/Self Sync/data/`
  - `self-sync.db` — SQLite (WAL)
  - `media/instagram/{thumbs,saved,videos}/` — downloaded files
- **Open data folder** button reveals it. **Export JSON** writes a full dump.

## Architecture (layered; extend to YT/TT here)

```
src/
  main.js                  entry: boot DB, register IPC, open window, lifecycle
  windows.js               main window + emit() to renderer
  paths.js                 userData/data/media path helpers
  ctx.js                   buildCtx() — binds net/disk/DB to ONE account's session
  preload.mjs              contextBridge → window.api (thin)
  ipc/                     IPC handlers by domain (accounts, sync, data, settings, shell) + index
  db/                      SQLite split by domain + barrel index (shared live `db` binding)
    connection.js (schema+migrations)  accounts  content  cursors  settings  runs  queries
  sync/session-fetch.js    hidden-window same-origin fetch (generic, all platforms)
  platforms/
    base.js                adapter contract (defineAdapter)
    index.js               registry
    instagram.js           ← the only fully-implemented adapter
    youtube.js  tiktok.js  stubs — implement sync()/resolveAccount(), flip enabled:true
  ui/                      renderer, ES modules: index.html, styles.css, dom.js, views.js, app.js
```

To add a platform: write an adapter (login URL, success check, headers,
`resolveAccount`, `sync`) and register it in `platforms/index.js`. The shell handles
login windows, per-account sessions, cookie capture, pacing/backoff, resume markers,
storage, media download, export, and all UI wiring.

**Multi-account:** each account gets its own `persist:<platform>:<n>` session partition
(stored on the `accounts` row); the UI switcher scopes every read/sync by active account.

## Use responsibly

Pull only accounts you own and are logged into. This calls private web endpoints,
which is against most platforms' ToS for third-party automation; use on your own
data, at gentle rates (delays are built in).
