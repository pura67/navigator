// Destination: write the export bundle to a local or mounted folder.
// config: { path }  → records under <path>/<prefix>/records/<kind>/<batch>.json,
// media mirrored under <path>/<prefix>/media/<relPath>.
import fs from 'node:fs';
import path from 'node:path';

const sane = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown';

export function folderDestination(config) {
  const base = config.path;
  if (!base) throw new Error('folder destination needs a path');
  const prefixFor = (src) => path.join(base, sane(src.platform), sane(src.account?.username || src.account?.user_id));

  return {
    async test() {
      fs.mkdirSync(base, { recursive: true });
      fs.accessSync(base, fs.constants.W_OK);
      return { ok: true, detail: base };
    },
    async sendBatch(env) {
      const dir = path.join(prefixFor(env.source), 'records', sane(env.kind));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${String(env.batch).padStart(5, '0')}.json`), JSON.stringify(env, null, 2));
    },
    async putBlob(src, { relPath, buffer }) {
      const abs = path.join(prefixFor(src), 'media', relPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buffer);
    },
  };
}
