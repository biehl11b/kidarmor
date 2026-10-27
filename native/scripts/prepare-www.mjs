// Builds www/ for the phone app from the KidArmor page. Copyright (c) 2026 Coastline Code LLC.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const app = read("src/app.html"), pre = read("src/native-pre.js"), post = read("src/native-post.js");
fs.rmSync(path.join(root, "www"), { recursive: true, force: true });
fs.mkdirSync(path.join(root, "www/vendor"), { recursive: true });
const coreSrc = ["dist/capacitor.js", "dist/capacitor.min.js"].map(f => path.join(root, "node_modules/@capacitor/core", f)).find(f => fs.existsSync(f));
if (coreSrc) fs.copyFileSync(coreSrc, path.join(root, "www/vendor/capacitor.js"));
console.log("capacitor core bundle:", coreSrc || "NOT FOUND", fs.existsSync(path.join(root, "node_modules/@capacitor/core/dist")) ? fs.readdirSync(path.join(root, "node_modules/@capacitor/core/dist")) : []);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="format-detection" content="telephone=no"><style>[hidden]{display:none!important}html,body{margin:0}</style>${coreSrc ? '<script src="vendor/capacitor.js"></script>' : ""}<script>${pre}</script></head><body>${app}<script>${post}</script></body></html>`;
fs.writeFileSync(path.join(root, "www/index.html"), html);
const libs = [
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", "pdf-lib.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js", "pdf.min.js"],
  ["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js", "pdf.worker.min.js"],
];
for (const [url, file] of libs) {
  const r = await fetch(url); if (!r.ok) throw new Error(`download failed ${url} ${r.status}`);
  fs.writeFileSync(path.join(root, "www/vendor", file), Buffer.from(await r.arrayBuffer()));
}
console.log("www ready:", fs.readdirSync(path.join(root, "www")), fs.readdirSync(path.join(root, "www/vendor")));
