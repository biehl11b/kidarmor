// Builds www/ for the phone app from the KidArmor page. Copyright (c) 2026 Coastline Code LLC.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url"; import crypto from "crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const app = read("src/app.html"), pre = read("src/native-pre.js"), post = read("src/native-post.js");
fs.rmSync(path.join(root, "www"), { recursive: true, force: true });
fs.mkdirSync(path.join(root, "www/vendor"), { recursive: true });
const coreSrc = ["dist/capacitor.js", "dist/capacitor.min.js"].map(f => path.join(root, "node_modules/@capacitor/core", f)).find(f => fs.existsSync(f));
if (coreSrc) fs.copyFileSync(coreSrc, path.join(root, "www/vendor/capacitor.js"));
console.log("capacitor core bundle:", coreSrc || "NOT FOUND", fs.existsSync(path.join(root, "node_modules/@capacitor/core/dist")) ? fs.readdirSync(path.join(root, "node_modules/@capacitor/core/dist")) : []);
// Content Security Policy: the page may only talk to itself and the KidArmor website
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https://kidarmor.coastlinecode.com data: blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="__CSP__"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="format-detection" content="telephone=no"><style>[hidden]{display:none!important}html,body{margin:0}</style>${coreSrc ? '<script src="vendor/capacitor.js"></script>' : ""}<script>${pre}</script></head><body>${app}<script>${post}</script></body></html>`;
// allow only this page's own inline scripts, by hash (no 'unsafe-inline')
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'");
const finalHtml = html.replace("__CSP__", CSP.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' " + hashes.join(" ")));
fs.writeFileSync(path.join(root, "www/index.html"), finalHtml);
console.log("CSP script hashes:", hashes.length);
// PDF libraries come from the site's own vendor folder (no CDN download)
for (const file of ["pdf-lib.min.js", "pdf.min.mjs", "pdf.worker.min.mjs"]) {
  fs.copyFileSync(path.join(root, "../vendor", file), path.join(root, "www/vendor", file));
}
// Fonts are bundled with the app (no requests to Google Fonts)
fs.cpSync(path.join(root, "../vendor/fonts"), path.join(root, "www/vendor/fonts"), { recursive: true });
// Shown instead of the app when the phone's Android System WebView is too old to run KidArmor
fs.writeFileSync(path.join(root, "www/webview-update.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KidArmor</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f4ef;color:#13232b}main{max-width:520px;margin:0 auto;padding:48px 24px}h1{font-size:24px;color:#1f5d70}p,li{font-size:17px;line-height:1.5}</style></head>
<body><main><h1>One quick update first</h1><p>KidArmor needs a newer version of <b>Android System WebView</b>, the part of Android that shows app screens. It's free and takes about a minute.</p>
<ol><li>Open the <b>Google Play Store</b>.</li><li>Search for <b>Android System WebView</b>.</li><li>Tap <b>Update</b>.</li><li>Open KidArmor again.</li></ol>
<p>Your KidArmor records are safe on this phone. Questions? info@coastlinecode.com · (228) 304-5333</p></main></body></html>`);
console.log("www ready:", fs.readdirSync(path.join(root, "www")), fs.readdirSync(path.join(root, "www/vendor")));
