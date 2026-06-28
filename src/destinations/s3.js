// Destination: any S3-compatible object store (works with the big cloud stores
// and self-hosted ones alike). Path-style PUT signed with AWS Signature V4 —
// no SDK, just node:crypto. config:
//   { endpoint, region, bucket, accessKeyId, secretAccessKey, prefix? }
// endpoint is the host root, e.g. https://s3.<region>.example.com  (no bucket).
import { net } from 'electron';
import crypto from 'node:crypto';

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
// AWS-flavoured percent-encoding; keep unreserved + '/'.
const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p) => p.split('/').map(enc).join('/');

function stamps() {
  const d = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  return { amzDate: d, dateStamp: d.slice(0, 8) };
}

export function s3Destination(config) {
  const { endpoint, region = 'auto', bucket, accessKeyId, secretAccessKey } = config;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error('s3 destination needs endpoint, bucket, accessKeyId, secretAccessKey');
  const host = new URL(endpoint).host;
  const prefix = (config.prefix || '').replace(/^\/+|\/+$/g, '');
  const sane = (s) => String(s || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');

  async function put(key, body, contentType) {
    const { amzDate, dateStamp } = stamps();
    const payloadHash = sha256hex(body);
    const canonicalUri = '/' + encPath(`${bucket}/${key}`);
    const canonicalHeaders =
      `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
    let k = hmac('AWS4' + secretAccessKey, dateStamp);
    k = hmac(k, region); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
    const signature = crypto.createHmac('sha256', k).update(toSign).digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await net.fetch(`${endpoint.replace(/\/+$/, '')}${canonicalUri}`, {
      method: 'PUT', body,
      // Host is set automatically from the URL (net.fetch forbids setting it
      // manually) and equals the host we signed, so the signature still matches.
      headers: {
        'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash,
        Authorization: authorization, 'Content-Type': contentType || 'application/octet-stream',
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`S3 ${res.status}${txt ? ` — ${txt.slice(0, 200)}` : ''}`);
    }
  }

  const keyFor = (src, ...parts) => [prefix, sane(src.platform), sane(src.account?.username || src.account?.user_id), ...parts].filter(Boolean).join('/');

  return {
    sendMedia: config.sendMedia !== false,
    async test() {
      await put([prefix, '.navigator-test'].filter(Boolean).join('/'), Buffer.from('ok'), 'text/plain');
      return { ok: true, detail: `${host}/${bucket}` };
    },
    async sendBatch(env) {
      const key = keyFor(env.source, 'records', sane(env.kind), `${String(env.batch).padStart(5, '0')}.json`);
      await put(key, Buffer.from(JSON.stringify(env)), 'application/json');
    },
    async putBlob(src, { relPath, buffer, contentType }) {
      await put(keyFor(src, 'media', relPath), buffer, contentType);
    },
  };
}
