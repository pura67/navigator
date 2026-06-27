// The context object handed to a platform adapter's sync()/resolveAccount().
// It binds all side effects (network, disk, DB) to ONE account's isolated session,
// so adapters stay pure data logic. For the login flow (before the row exists),
// pass a stub account that carries just a `.partition`.
import { net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

import * as DB from './db/index.js';
import { sessionFetch, cookieMap } from './sync/session-fetch.js';
import { tunedSession } from './session-config.js';
import { mediaDir, userDataDir } from './paths.js';

export async function buildCtx(adapter, account) {
  const partition = account.partition;
  const root = userDataDir();
  const cookies = await cookieMap(partition, adapter.cookieDomain);
  const mediaRoot = mediaDir(adapter.id);

  async function downloadMedia(url, subdir, name) {
    if (!url) return null;
    try {
      const sess = tunedSession(partition);
      const res = await net.fetch(url, { session: sess, useSessionCookies: true });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const dir = path.join(mediaRoot, subdir);
      fs.mkdirSync(dir, { recursive: true });
      const abs = path.join(dir, name);
      fs.writeFileSync(abs, buf);
      return path.relative(root, abs); // portable relative path
    } catch { return null; }
  }

  return {
    accountId: account?.id,
    userId: account?.user_id,
    username: account?.username,
    cookies,
    options: {
      downloadVideos: DB.getSetting('downloadVideos', '0') === '1',
      pacing: DB.getSetting('pacing', 'balanced'),
      cutoff: DB.getSetting('cutoff', 'all'),
    },
    fetch: (url, opts) => sessionFetch(partition, adapter, url, opts),
    downloadMedia,
    saveMedia: (rows) => DB.saveMedia(rows),
    saveInsight: (mediaId, json) => DB.saveInsight(mediaId, account.id, json),
    saveSaved: (rows) => DB.saveSaved(rows),
    saveConnections: (kind, rows) => DB.saveConnections(account.id, kind, rows),
    saveDmShared: (rows) => DB.saveDmShared(rows),
    existingDmIds: () => DB.existingDmIds(account.id),
    existingCodes: (kind) => DB.existingCodes(account.id, kind),
    missingVideos: (kind) => DB.countMissingVideos(account.id, kind),
    mediaMissingInsights: () => DB.mediaMissingInsights(account.id),
    getCursor: (category) => DB.getCursor(account.id, category),
    setCursor: (category, patch) => DB.setCursor(account.id, category, patch),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
