// Platform adapter contract.
//
// Every platform (instagram, youtube, tiktok, …) implements this shape. The
// Electron shell (main.js) is 100% generic: it knows how to open a login window,
// capture cookies, run same-origin fetches from a hidden window, persist to
// SQLite and download media. Everything platform-specific lives in an adapter.
//
// An adapter is a plain object. Required fields:
//
//   id            string   stable key, e.g. 'instagram'         (also the DB platform key)
//   label         string   display name, e.g. 'Instagram'
//   enabled       bool     false → shown as "coming soon" in UI
//   partition     string   electron session partition, e.g. 'persist:instagram'
//   cookieDomain  string   domain to harvest cookies for, e.g. '.instagram.com'
//   loginUrl      string   page to open for the login flow
//   homeUrl       string   logged-in page the hidden fetch window sits on (same-origin base for API calls)
//
//   loginSuccess(url, cookies) -> bool
//       Given the current navigation url + the platform's cookies, decide whether
//       login has completed (so we can harvest + close the login window).
//
//   buildHeaders(cookies) -> object
//       Extra request headers to attach to every same-origin fetch (csrf, app-id…).
//       Cookies themselves ride along automatically (credentials:'include').
//
//   async resolveAccount(ctx) -> { user_id, username, display_name, profile }
//       Identify the logged-in user. `profile` is stored as raw JSON.
//
//   scopes -> [{ key, label }]
//       The toggleable data types this platform can pull (posts, insights, …).
//
//   async sync(ctx, scope, emit)
//       Do the work for the enabled scope keys. Use ctx.fetch / ctx.save* /
//       ctx.downloadMedia and call emit({type,message,...}) for UI progress.
//
// ctx (provided by the shell) =
//   {
//     accountId,                       // DB row id for this connected account
//     userId, username,                // resolved identity
//     fetch(path, opts?) -> {status,data,headers},   // same-origin fetch via hidden window
//     downloadMedia(url, subdir, name) -> localRelPath | null,
//     saveMedia(rows), saveSaved(rows), saveConnections(kind, rows), saveInsight(mediaId, json),
//     sleep(ms),
//   }

export function defineAdapter(adapter) {
  const required = [
    'id', 'label', 'partition', 'cookieDomain', 'loginUrl', 'homeUrl',
    'loginSuccess', 'buildHeaders', 'resolveAccount', 'scopes', 'sync',
  ];
  for (const k of required) {
    if (!(k in adapter)) throw new Error(`adapter '${adapter.id || '?'}' missing '${k}'`);
  }
  if (!('enabled' in adapter)) adapter.enabled = true;
  return adapter;
}
