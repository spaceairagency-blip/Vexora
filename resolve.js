// Turns whatever was typed into a URL or a search (used by the start page).
function resolve(s, engine) {
  s = (s || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^[^\s\/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s)) return 'https://' + s;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return 'http://' + s;
  return (engine || 'https://www.google.com/search?q=%s').replace('%s', encodeURIComponent(s));
}
