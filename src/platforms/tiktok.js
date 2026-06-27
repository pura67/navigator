// TikTok self-account adapter — STUB.
//
// Shell wiring is done; fill in the body to activate. Flip `enabled: true`.
//
// Plan: login at tiktok.com/login → tiktok.com. Pull your own posts via the
// web API (e.g. /api/post/item_list/) using the hidden-window same-origin fetch.
// TikTok signs requests with X-Bogus / msToken / _signature — those are computed
// by page JS, so prefer calling the same fetch the site uses (or read the signed
// params off window). Analytics live in TikTok Studio.

import { defineAdapter } from './base.js';

export default defineAdapter({
  id: 'tiktok',
  label: 'TikTok',
  enabled: false,
  partition: 'persist:tiktok',
  cookieDomain: '.tiktok.com',
  loginUrl: 'https://www.tiktok.com/login',
  homeUrl: 'https://www.tiktok.com/',
  loginSuccess(url, cookies) { return !!cookies.sessionid && !/\/login/.test(url); },
  buildHeaders() { return {}; },
  async resolveAccount() { throw new Error('TikTok adapter not implemented yet'); },
  scopes: [
    { key: 'media', label: 'Posts' },
    { key: 'insights', label: 'Analytics' },
  ],
  async sync() { throw new Error('TikTok adapter not implemented yet'); },
});
