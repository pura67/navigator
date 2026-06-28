// Resolve a destination from a single pasted URL / connection string, so the
// user never has to classify the provider. Recognizes:
//   - Azure Blob SAS URL .............................. → azure
//   - object-store URL with key:secret in it
//     (AWS S3 · GCS interop · Cloudflare R2 · Backblaze B2 · MinIO) → s3
//   - any other http(s) URL ........................... → webhook
// Returns { type, config } ready to store.
const carry = (extra) => {
  const o = {};
  for (const k of ['prefix', 'content', 'sendMedia']) if (extra[k] !== undefined) o[k] = extra[k];
  return o;
};

const awsRegion = (host) => {
  const m = host.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com$/);
  return m ? m[1] : 'us-east-1';
};

export function detectDestination(input, extra = {}) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('paste a connection URL or SAS');
  let u;
  try { u = new URL(raw); } catch { throw new Error('that doesn\'t look like a URL'); }
  const host = u.hostname.toLowerCase();

  // Azure Blob — the SAS query (sig=…) carries the auth.
  if (host.endsWith('.blob.core.windows.net') || (u.searchParams.has('sig') && host.includes('blob')))
    return { type: 'azure', config: { sasUrl: raw, ...carry(extra) } };

  // S3-compatible object stores. Creds may ride in the URL as key:secret@host.
  const isGcs = host === 'storage.googleapis.com' || host.endsWith('.storage.googleapis.com');
  const isAws = host.endsWith('.amazonaws.com');
  const isR2 = host.endsWith('.r2.cloudflarestorage.com');
  const isB2 = host.endsWith('.backblazeb2.com');
  const hasCreds = !!(u.username && u.password);
  if (hasCreds || isGcs || isAws || isR2 || isB2) {
    const segs = u.pathname.split('/').filter(Boolean);
    const bucket = extra.bucket || segs.shift();
    if (!bucket) throw new Error('include the bucket in the path, e.g. https://key:secret@host/bucket');
    const prefix = extra.prefix || segs.join('/') || '';
    const region = u.searchParams.get('region') || extra.region || (isAws ? awsRegion(host) : 'auto');
    return { type: 's3', config: {
      endpoint: `${u.protocol}//${u.host}`, // u.host = host:port, no userinfo
      bucket, region, prefix,
      accessKeyId: extra.accessKeyId || decodeURIComponent(u.username || ''),
      secretAccessKey: extra.secretAccessKey || decodeURIComponent(u.password || ''),
      ...carry(extra),
    } };
  }

  // Anything else: treat it as a plain HTTP endpoint.
  return { type: 'webhook', config: { url: raw, ...carry(extra) } };
}
