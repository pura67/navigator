// Tiny DOM helpers shared across the renderer.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => (s == null ? '' : String(s)).replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtDate = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '');
