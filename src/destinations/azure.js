// Destination: Azure Blob Storage via a container SAS URL — the standard scoped,
// time-limited, revocable Azure credential (the SAS itself is the auth, so no
// signing/SDK needed). config: { sasUrl, prefix?, content?, sendMedia? }.
// sasUrl points at a container, e.g.
//   https://<account>.blob.core.windows.net/<container>?sv=...&ss=b&sig=...
import { net } from 'electron';

const sane = (s) => String(s || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
const encKey = (k) => k.split('/').map(encodeURIComponent).join('/');

export function azureDestination(config) {
  const sasUrl = config.sasUrl;
  if (!sasUrl || !/^https?:\/\/.+\?.+/.test(sasUrl))
    throw new Error('Azure destination needs a container SAS URL (https://<acct>.blob.core.windows.net/<container>?sv=…&sig=…)');
  const q = sasUrl.indexOf('?');
  const root = sasUrl.slice(0, q).replace(/\/+$/, '');
  const query = sasUrl.slice(q + 1);
  const prefix = (config.prefix || '').replace(/^\/+|\/+$/g, '');

  async function put(key, body, contentType) {
    const res = await net.fetch(`${root}/${encKey(key)}?${query}`, {
      method: 'PUT', body,
      headers: { 'x-ms-blob-type': 'BlockBlob', 'x-ms-version': '2021-08-06', 'Content-Type': contentType || 'application/octet-stream' },
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Azure ${res.status}${t ? ` — ${t.slice(0, 200)}` : ''}`); }
  }

  const keyFor = (src, ...parts) => [prefix, sane(src.platform), sane(src.account?.username || src.account?.user_id), ...parts].filter(Boolean).join('/');

  return {
    sendMedia: config.sendMedia !== false,
    async test() {
      await put([prefix, '.navigator-test'].filter(Boolean).join('/'), Buffer.from('ok'), 'text/plain');
      return { ok: true, detail: root };
    },
    async sendBatch(env) {
      await put(keyFor(env.source, 'records', sane(env.kind), `${String(env.batch).padStart(5, '0')}.json`), Buffer.from(JSON.stringify(env)), 'application/json');
    },
    async putBlob(src, { relPath, buffer, contentType }) {
      await put(keyFor(src, 'media', relPath), buffer, contentType);
    },
  };
}
