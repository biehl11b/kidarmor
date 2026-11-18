// Adds older CSS right before newer CSS that phones with an older built-in web viewer (Android System
// WebView 69-86) don't understand. Older viewers use the first line; newer ones use the second, so new
// phones look exactly the same. Copyright (c) 2026 Coastline Code LLC.
//   inset (WebView 87+)       → top/right/bottom/left   (full-screen screens like Welcome, PIN lock, sheets)
//   min()/max() (79+)         → the plain size
//   color-mix() (111+)        → the base color
export function oldWebviewCss(s) {
  let n = 0;
  // inset:a b c d  →  top:a;right:b;bottom:c;left:d;inset:...
  s = s.replace(/(^|[;{"'\s])inset:([^;}"'`]+)/g, (m, pre, v) => {
    const p = v.trim().split(/\s+/); const [t, r = t, b = t, l = r] = p; n++;
    return `${pre}top:${t};right:${r};bottom:${b};left:${l};inset:${v}`;
  });
  // prop:...max(16px,env(...))...  →  prop:...16px...;prop:...max(...)...
  s = s.replace(/(^|[;{"'\s])([a-z-]+):([^;{}"'`]*\b(?:max|min)\([^;{}"'`]*)/g, (m, pre, prop, val) => {
    if (/^(?:width)$/.test(prop) && /^min\(100%,\s*(\d+px)\)$/.test(val.trim())) { n++; return `${pre}width:100%;max-width:${val.trim().match(/(\d+px)/)[1]};${prop}:${val}` }
    const fb = val.replace(/\bmax\((\d+px),env\([^()]*\)\)/g, "$1");
    if (fb === val || /\b(?:max|min)\(/.test(fb)) return m;
    n++; return `${pre}${prop}:${fb};${prop}:${val}`;
  });
  // prop:...color-mix(in srgb,A N%,B)...  →  prop:...B...;prop:...color-mix(...)...
  s = s.replace(/(^|[;{"'\s])([a-z-]+):([^;{}"'`]*color-mix\([^;{}"'`]*)/g, (m, pre, prop, val) => {
    let fb = val, prev;
    do { prev = fb; fb = fb.replace(/color-mix\(in srgb,\s*(?:var\([^()]*\)|[^,()]+)\s+\d+%,\s*(var\([^()]*\)|[^,()]+)\)/, "$1") } while (fb !== prev);
    fb = fb.replace(/var\(--accent-soft,(var\(--surface\))\)/, "$1");
    if (fb === val || /color-mix/.test(fb)) return m;
    n++; return `${pre}${prop}:${fb};${prop}:${val}`;
  });
  return { css: s, changed: n };
}
