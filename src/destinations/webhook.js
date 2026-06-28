// Destination: POST the export to any HTTP endpoint. Backend-agnostic — the
// receiver just needs to accept JSON record batches and (optionally) binary
// blobs. config: { url, headers?: {name:value}, token?, sendMedia?: bool }.
//   - records: POST application/json envelope  (X-Export-Kind: records)
//   - blob:    POST raw bytes of the media file (X-Export-Kind: blob,
//              X-Export-Path: <relPath>, X-Export-Platform / -Account headers)
import { net } from 'electron';

// headers may be an object or a "Name: value" text block (one per line).
function parseHeaders(h) {
  if (!h) return {};
  if (typeof h === 'object') return h;
  const out = {};
  for (const line of String(h).split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function headersFor(config, extra) {
  const h = { ...parseHeaders(config.headers), ...extra };
  if (config.token && !Object.keys(h).some((k) => k.toLowerCase() === 'authorization'))
    h.Authorization = `Bearer ${config.token}`;
  return h;
}

async function post(url, headers, body) {
  const res = await net.fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${txt ? ` — ${txt.slice(0, 200)}` : ''}`);
  }
  return res;
}

export function webhookDestination(config) {
  const url = config.url;
  if (!url || !/^https?:\/\//.test(url)) throw new Error('webhook needs a valid http(s) URL');

  return {
    sendMedia: config.sendMedia !== false,
    async test() {
      await post(url, headersFor(config, { 'Content-Type': 'application/json', 'X-Export-Kind': 'ping' }),
        JSON.stringify({ schema: 'social-export/1', kind: 'ping' }));
      return { ok: true, detail: url };
    },
    async sendBatch(env) {
      await post(url, headersFor(config, { 'Content-Type': 'application/json', 'X-Export-Kind': 'records' }),
        JSON.stringify(env));
    },
    async putBlob(src, { relPath, buffer, contentType }) {
      await post(url, headersFor(config, {
        'Content-Type': contentType || 'application/octet-stream',
        'X-Export-Kind': 'blob',
        'X-Export-Path': encodeURI(relPath),
        'X-Export-Platform': src.platform || '',
        'X-Export-Account': src.account?.username || src.account?.user_id || '',
      }), buffer);
    },
  };
}
