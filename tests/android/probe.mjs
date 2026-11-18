// Quick check: open the test build, reload it with DevTools attached, and report every script error
// and whether the Welcome (agree) screen shows. Writes OUT/probe.txt.
import { execFileSync } from "child_process"; import fs from "fs";
const PKG = "com.coastlinecode.kidarmor", OUT = process.env.OUT || "probe"; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => { try { return execFileSync("adb", a, { encoding: "utf8", timeout: 60000 }) } catch (e) { return (e.stdout || "") + (e.stderr || "") } };
const lines = []; const log = s => { console.log(s); lines.push(s) };
let ws, id = 0; const pend = new Map(), errs = [], cons = [];
function cdp(m, p = {}) { return new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); r({}) } }, 20000) }) }
async function ev(x) { const r = await cdp("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return r.result ? (r.result.exceptionDetails ? "THREW " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result.result.value) : "no answer" }
log("WebView: " + (adb("shell", "dumpsys", "webviewupdate").match(/Current WebView package \(name, version\): \(([^)]+)\)/) || [])[1]);
adb("shell", "pm", "clear", PKG); adb("shell", "am", "start", "-n", PKG + "/.MainActivity"); await sleep(12000);
let url = null;
for (let i = 0; i < 30 && !url; i++) { const p = adb("shell", "pidof", PKG).trim(); if (p) { adb("forward", "--remove-all"); adb("forward", "tcp:9222", "localabstract:webview_devtools_remote_" + p); try { const l = await (await fetch("http://127.0.0.1:9222/json")).json(); const pg = l.find(x => x.type === "page"); if (pg) url = pg.webSocketDebuggerUrl } catch (e) { } } await sleep(1000) }
if (!url) { log("could not attach DevTools"); fs.writeFileSync(OUT + "/probe.txt", lines.join("\n")); process.exit(0) }
ws = new WebSocket(url);
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; errs.push((d.exception?.description || d.text) + ` @line ${d.lineNumber}:${d.columnNumber}`) }
  if (m.method === "Runtime.consoleAPICalled" && /error|warn/.test(m.params.type)) cons.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description).join(" ")) };
await cdp("Runtime.enable"); await cdp("Page.enable");
log("before reload, agree screen: " + await ev("!!document.querySelector('.agreescreen')"));
await cdp("Page.reload", { ignoreCache: true }); await sleep(12000);
log("after reload, agree screen: " + await ev("!!document.querySelector('.agreescreen')"));
log("UA: " + await ev("navigator.userAgent"));
for (const f of ["initLock", "renderWho", "recoverRecDraft", "checkReminders", "initFramed", "refreshResources", "renderStateResources", "needsWizard"])
  log(`${f}: ` + await ev(`(async()=>{try{if(typeof ${f}!=="function")return "missing";await ${f}();return "ok"}catch(e){return "ERROR "+(e&&e.stack||e)}})()`));
log("errors while loading:"); errs.forEach(e => log("  " + e)); cons.forEach(c => log("  " + c));
fs.writeFileSync(OUT + "/probe.txt", lines.join("\n")); ws.close(); process.exit(0);
