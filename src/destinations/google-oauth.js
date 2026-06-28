// One-time Google sign-in for the Drive destination: the OAuth 2.0 loopback flow
// for installed apps (PKCE, no client secret on the wire beyond the exchange).
// Opens the consent page in the user's browser, catches the redirect on a local
// 127.0.0.1 port, and exchanges the code for a refresh token.
// `deps` lets tests inject endpoints + a fake browser opener.
import { net, shell } from 'electron';
import http from 'node:http';
import crypto from 'node:crypto';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function connectDrive(clientId, clientSecret, deps = {}) {
  const authBase = deps.auth || AUTH;
  const tokenBase = deps.token || TOKEN;
  const open = deps.open || ((url) => shell.openExternal(url));
  const timeoutMs = deps.timeoutMs || 180000;

  return new Promise((resolve, reject) => {
    if (!clientId || !clientSecret) return reject(new Error('enter the Google OAuth client ID and secret first'));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    let port, timer;
    const done = (fn, arg) => { clearTimeout(timer); try { server.close(); } catch { /* noop */ } fn(arg); };

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!url.searchParams.has('code') && !url.searchParams.has('error')) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<body style="font:16px sans-serif;padding:40px"><h2>✓ Connected</h2><p>You can close this tab and return to Navigator.</p></body>');
      if (url.searchParams.get('error')) return done(reject, new Error(url.searchParams.get('error')));
      if (url.searchParams.get('state') !== state) return done(reject, new Error('state mismatch — aborted'));
      try {
        const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: url.searchParams.get('code'), code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: `http://127.0.0.1:${port}` });
        const tr = await net.fetch(tokenBase, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        if (!tr.ok) return done(reject, new Error(`token ${tr.status} — ${(await tr.text().catch(() => '')).slice(0, 200)}`));
        const j = await tr.json();
        if (!j.refresh_token) return done(reject, new Error('Google returned no refresh token — revoke prior access for this app and try again'));
        done(resolve, { refreshToken: j.refresh_token });
      } catch (e) { done(reject, e); }
    });

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      const auth = `${authBase}?` + new URLSearchParams({
        client_id: clientId, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code',
        scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
        code_challenge: challenge, code_challenge_method: 'S256', state,
      });
      open(auth);
    });
    timer = setTimeout(() => done(reject, new Error('timed out waiting for Google sign-in')), timeoutMs);
  });
}
