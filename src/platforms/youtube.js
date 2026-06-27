// YouTube self-account adapter — STUB.
//
// Shell wiring is done; fill in the body to activate. Flip `enabled: true`.
//
// Plan: login at accounts.google.com → youtube.com/account. Pull your channel's
// uploads + (if available) YouTube Studio analytics. The same hidden-window
// same-origin fetch works against YouTube's internal `youtubei/v1/*` endpoints
// (needs the INNERTUBE_API_KEY + client context read from ytcfg on the page).

import { defineAdapter } from './base.js';

export default defineAdapter({
  id: 'youtube',
  label: 'YouTube',
  enabled: false,
  partition: 'persist:youtube',
  cookieDomain: '.youtube.com',
  loginUrl: 'https://accounts.google.com/ServiceLogin?service=youtube',
  homeUrl: 'https://www.youtube.com/',
  loginSuccess(url, cookies) { return !!cookies.SID && /youtube\.com/.test(url); },
  buildHeaders() { return {}; },
  async resolveAccount() { throw new Error('YouTube adapter not implemented yet'); },
  scopes: [
    { key: 'media', label: 'Uploads' },
    { key: 'insights', label: 'Analytics' },
  ],
  async sync() { throw new Error('YouTube adapter not implemented yet'); },
});
