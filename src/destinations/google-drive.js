// Destination: Google Drive (the WhatsApp model — back up to YOUR Drive; whoever
// you grant access reads the same folder). Auth is an OAuth refresh token obtained
// once via the connect flow (google-oauth.js); here we refresh access tokens + upload.
// config: { clientId, clientSecret, refreshToken, folderId?, prefix?, content?, sendMedia?, _endpoints? }
import { net } from 'electron';

const GOOGLE = {
  token: 'https://oauth2.googleapis.com/token',
  upload: 'https://www.googleapis.com/upload/drive/v3/files',
  api: 'https://www.googleapis.com/drive/v3/files',
};

const sane = (s) => String(s || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
const basename = (p) => p.split('/').filter(Boolean).pop() || 'file';

export function googleDriveDestination(config) {
  const { clientId, clientSecret, refreshToken } = config;
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error('Google Drive needs clientId, clientSecret and an authorized account (use Connect)');
  const ep = config._endpoints || GOOGLE;
  const rootFolder = config.folderId || 'root';
  const prefix = (config.prefix || '').replace(/^\/+|\/+$/g, '');

  let token = null, tokenExp = 0;
  async function getToken() {
    if (token && Date.now() < tokenExp - 30000) return token;
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
    const res = await net.fetch(ep.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!res.ok) throw new Error(`Google token ${res.status} — ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const j = await res.json();
    token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
    return token;
  }
  const authed = async (url, opts = {}) =>
    net.fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${await getToken()}` } });

  // Resolve (creating if needed) a "/"-delimited folder path; cache ids.
  const folders = new Map([['', rootFolder]]);
  async function ensureFolder(pathStr) {
    if (folders.has(pathStr)) return folders.get(pathStr);
    let parent = rootFolder, acc = '';
    for (const name of pathStr.split('/').filter(Boolean)) {
      acc = acc ? `${acc}/${name}` : name;
      if (folders.has(acc)) { parent = folders.get(acc); continue; }
      const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`);
      let id;
      const lr = await authed(`${ep.api}?q=${q}&fields=files(id)&pageSize=1`);
      if (lr.ok) id = (await lr.json()).files?.[0]?.id;
      if (!id) {
        const cr = await authed(`${ep.api}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) });
        if (!cr.ok) throw new Error(`Drive mkdir ${cr.status} — ${(await cr.text().catch(() => '')).slice(0, 200)}`);
        id = (await cr.json()).id;
      }
      folders.set(acc, id); parent = id;
    }
    folders.set(pathStr, parent);
    return parent;
  }

  async function uploadFile(folderPath, name, buffer, contentType) {
    const parent = await ensureFolder(folderPath);
    const boundary = '----navigator' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const res = await authed(`${ep.upload}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: Buffer.concat([head, buffer, tail]) });
    if (!res.ok) throw new Error(`Drive upload ${res.status} — ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }

  const folderFor = (src) => [prefix, `${sane(src.platform)}_${sane(src.account?.username || src.account?.user_id)}`].filter(Boolean).join('/');

  return {
    sendMedia: config.sendMedia !== false,
    async test() {
      const r = await authed(`${ep.api}?pageSize=1&fields=files(id)`);
      if (!r.ok) throw new Error(`Drive ${r.status} — ${(await r.text().catch(() => '')).slice(0, 120)}`);
      return { ok: true, detail: 'Google Drive' };
    },
    async sendBatch(env) {
      await uploadFile(folderFor(env.source), `records__${sane(env.kind)}__${String(env.batch).padStart(5, '0')}.json`, Buffer.from(JSON.stringify(env)), 'application/json');
    },
    async putBlob(src, { relPath, buffer, contentType }) {
      await uploadFile(folderFor(src), basename(relPath), buffer, contentType);
    },
  };
}
