// KidArmor Android phone test. Drives the real app on a virtual Android phone:
// the app's screens through Chrome DevTools, and Android's own screens (permission prompts,
// file picker, share sheet) through adb + uiautomator. Writes results to emu/.
import { execSync, execFileSync } from "child_process";
import fs from "fs";
const PKG = "com.coastlinecode.kidarmor", OUT = process.env.OUT || "emu";
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean); // run only some steps (quick checks)
const results = []; let shot = 0, ws = null, msgId = 0; const pending = new Map(); const jsErrors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => { try { return execFileSync("adb", a, { encoding: "utf8", timeout: 60000 }) } catch (e) { return (e.stdout || "") + (e.stderr || "") } };
const sh = c => adb("shell", c);
const ok = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log((pass ? "  ok   " : "  FAIL ") + name + (detail ? "  → " + detail : "")) };
const snap = label => { const f = `${OUT}/${String(++shot).padStart(2, "0")}-${label}.png`; try { fs.writeFileSync(f, execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 50e6 })) } catch (e) { } return f };
// ---------- Android screens via uiautomator ----------
function ui() { sh("uiautomator dump /sdcard/ui.xml >/dev/null 2>&1"); return adb("shell", "cat", "/sdcard/ui.xml") }
function nodes(xml) { return [...xml.matchAll(/<node [^>]*>/g)].map(m => { const t = m[0], g = k => (t.match(new RegExp(k + '="([^"]*)"')) || [])[1] || ""; const b = g("bounds").match(/\d+/g) || [0, 0, 0, 0]; return { text: g("text"), desc: g("content-desc"), id: g("resource-id"), pkg: g("package"), x: (+b[0] + +b[2]) >> 1, y: (+b[1] + +b[3]) >> 1 } }) }
async function tapText(re, tries = 8) { for (let i = 0; i < tries; i++) { const n = nodes(ui()).find(n => re.test(n.text) || re.test(n.desc)); if (n) { sh(`input tap ${n.x} ${n.y}`); await sleep(1200); return n } await sleep(1000) } return null }
const screenHas = re => nodes(ui()).some(n => re.test(n.text) || re.test(n.desc));
const topPkg = () => { const xml = ui(); const m = xml.match(/package="([^"]+)"/); return m ? m[1] : "" };
// ---------- the app's web view via Chrome DevTools ----------
const pid = () => sh(`pidof ${PKG}`).trim();
async function connect() {
  for (let i = 0; i < 30; i++) {
    const p = pid(); if (p) { adb("forward", "--remove-all"); adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${p}`);
      try { const list = await (await fetch("http://127.0.0.1:9222/json")).json(); const pg = list.find(x => x.type === "page" && /localhost/.test(x.url)); if (pg) { await openWs(pg.webSocketDebuggerUrl); return true } } catch (e) { } }
    await sleep(1000) }
  return false }
function openWs(url) { return new Promise((res, rej) => { ws = new WebSocket(url); ws.onopen = async () => { await cdp("Runtime.enable"); await cdp("Page.enable"); res() }; ws.onerror = rej;
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } if (m.method === "Runtime.exceptionThrown") jsErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text) } }) }
function cdp(method, params = {}) { return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ error: { message: "timeout " + method } }) } }, 25000) }) }
async function js(expr) { const r = await cdp("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.error) return { __err: r.error.message }; if (r.result.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }; return r.result.result.value }
async function waitFor(expr, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await js(`return !!(${expr})`); if (v === true) return true; await sleep(500) } return false }
const click = sel => js(`const e=document.querySelector(${JSON.stringify(sel)});if(!e)return "missing";e.scrollIntoView({block:"center"});e.click();return "ok"`);
async function launch(fresh) { if (fresh) sh(`pm clear ${PKG}`); sh(`am force-stop ${PKG}`); await sleep(800); sh(`am start -n ${PKG}/.MainActivity`); await sleep(6000); if (ws) try { ws.close() } catch (e) { } return connect() }
const step = (name) => { if (ONLY.length && !ONLY.includes(name)) return false; if (topPkg() !== PKG) { sh("input keyevent 4"); sh(`am start -n ${PKG}/.MainActivity`) } return true };
// ---------- the walkthrough ----------
async function main() {
  sh("settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0");
  const api = +sh("getprop ro.build.version.sdk").trim(); console.log("Android API", api);
  // a photo to pick later
  fs.copyFileSync(new URL("./report-card.png", import.meta.url), "/tmp/report-card.png");
  adb("push", "/tmp/report-card.png", "/sdcard/Download/report-card.png");
  adb("push", "/tmp/report-card.png", "/sdcard/DCIM/report-card.png");
  sh("am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/report-card.png");
  sh("am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/report-card.png");
  sh("content call --method scan_volume --uri content://media --arg external_primary");
  ok("app opens and connects", await launch(true));
  await sleep(4000); snap("first-open");
  const ua = await js(`return navigator.userAgent`); fs.writeFileSync(`${OUT}/webview.txt`, String(ua));
  ok("web view version", true, (String(ua).match(/Chrome\/[\d.]+/) || [ua])[0]);
  ok("phone features load (native mode)", await js(`return window.KA_NATIVE===true&&!!window.Capacitor`));
  // skip only the first-run screens covered by the browser tests (Terms screen and setup wizard)
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: "window.__kaSkipTerms=true;window.__kaSkipWizard=true;" });
  await cdp("Page.reload", {}); await sleep(5000);
  await click("#startOwn"); await sleep(800);
  await js(`document.querySelector("#s-child").value="Ava Test";document.querySelector("#s-parent").value="Josh";document.querySelector("#setupForm button[type=submit]").click();return 1`);
  await sleep(1500); await click("#fsDone"); await sleep(500); await click('nav.tabs button[data-v="home"]'); await sleep(800);
  ok("child added", await js(`return state&&state.child&&state.child.name==="Ava Test"`)); snap("home");

  if (step("record")) { // ---- record a meeting (microphone permission + MediaRecorder on Android)
    await click("#homeRecord"); await sleep(1000); await click("#recStart"); await sleep(1500);
    // first recording asks how to make transcripts; pick the private option like a cautious parent would
    const choice = await js(`const b=[...document.querySelectorAll("button")].find(b=>/Use on this phone only/i.test(b.textContent));if(b){b.click();return "chose on-phone"}return "no choice screen"`); console.log("   ", choice); await sleep(1500);
    if (await js(`return !document.querySelector("#recStop")||document.querySelector("#recStop").offsetParent===null`)) { await click("#recStart"); await sleep(1500) }
    const allow = await tapText(/^(While using the app|Allow|Only this time|ALLOW)$/i, 6); snap("mic-permission");
    ok("microphone permission prompt appears", !!allow, allow ? allow.text : topPkg());
    await sleep(1500); await tapText(/^(While using the app|Allow|ALLOW)$/i, 2); // speech recognizer may ask too
    await sleep(5000); const t = await js(`return (document.querySelector("#recTime")||{}).textContent||""`);
    ok("recording timer runs", /0[0-9]:0[2-9]|0[0-9]:[1-5][0-9]/.test(t), t); snap("recording");
    await click("#recTold"); await sleep(500); await click("#recStop");
    const done = await waitFor(`document.querySelector(".sheet #smDone")`, 20000); snap("after-stop");
    const r = await js(`const e=state.entries[0];if(!e||!e.recordings||!e.recordings[0])return null;const m=e.recordings[0];const f=await getFile(m.id);return{type:m.type,size:f&&f.blob.size,secs:e.recordingSeconds,id:m.id}`);
    ok("recording saved on the phone", r && r.size > 1000 && /^audio\//.test(r.type), JSON.stringify(r));
    if (done) await click(".sheet #smDone");
    if (r) fs.writeFileSync(`${OUT}/rec-id.txt`, r.id + " " + r.size);
  }
  if (step("photo")) { // ---- add a photo through Android's file picker
    await click('nav.tabs button[data-v="plan"]'); await js(`show("plan");return 1`); await sleep(800);
    const before = await js(`return state.docs.length`);
    await js(`document.querySelector("#d-name").value="Report card";document.querySelector("#d-file").click();return 1`); await sleep(3000); snap("picker-1");
    fs.writeFileSync(`${OUT}/picker-ui.xml`, ui());
    // Android 13+ opens the photo picker for pictures; older Android opens the file picker
    let picked = null; const pk = topPkg(); console.log("    picker:", pk);
    if (/media|photopicker/i.test(pk)) {
      const th = nodes(ui()).find(n => /^(Photo|Image)/i.test(n.desc) && !/album/i.test(n.desc));
      if (th) { sh(`input tap ${th.x} ${th.y}`); await sleep(1500); picked = th; await tapText(/^(Add|Done|Select)( \(1\))?$/i, 2) }
    }
    for (let i = 0; i < 3 && !picked; i++) {
      if (topPkg() === "com.google.android.apps.photos") { sh("input keyevent 4"); await sleep(1500) }
      picked = await tapText(/^report-card\.png$/i, 2);
      if (!picked) { await tapText(/^Show roots$|^Open navigation drawer$/i, 2); await sleep(800); await tapText(/^Downloads$/i, 3); await sleep(1500) }
    }
    snap("picker-2"); ok("Android file picker opens and shows the photo", !!picked, topPkg());
    const saved = await waitFor(`state.docs.length>${before}`, 15000);
    const d = await js(`const d=state.docs[state.docs.length-1];if(!d)return null;const f=await getFile(d.files[0].id);return{name:d.name,type:f&&f.type,size:f&&f.blob.size}`);
    ok("photo saved with the case", saved && d && d.size > 100, JSON.stringify(d)); snap("photo-saved");
  }
  if (step("pdf")) { // ---- make the PDF case binder and share it
    await js(`show("home");return 1`); await sleep(800); await click("#homeBinder");
    const opened = await waitFor(`document.querySelector(".viewer canvas, .viewer .vbody img, .viewer .vbody embed, .viewer .pdfpage")`, 45000); snap("binder");
    const pdfjs = await js(`try{await getPdfjs();return "pdf viewer loaded"}catch(e){return "pdf viewer failed: "+(e&&e.message)}`);
    ok("PDF preview library loads", /loaded/.test(pdfjs), pdfjs);
    ok("PDF binder is made and shows", opened, await js(`return (document.querySelector(".viewer .vbody")||{}).innerText||"no viewer"`));
    await click("#vdl"); await sleep(4000); snap("share-sheet");
    const files = sh(`run-as ${PKG} ls -la cache/kidarmor-out`); const pdf = /Case Binder.*\.pdf/.test(files);
    ok("PDF file written for sharing", pdf, files.split("\n").filter(l => /pdf/.test(l)).join(" ") || files.slice(0, 120));
    const sheet = topPkg(); ok("Android share sheet opens", sheet && sheet !== PKG && !/launcher/.test(sheet), sheet);
    sh("input keyevent 4"); await sleep(1500); await click("#vclose"); await sleep(500);
  }
  if (step("remind")) { // ---- reminders (notification permission + scheduled alerts)
    await js(`askNotify();return 1`); await sleep(2500);
    const allow = api >= 33 ? await tapText(/^(Allow|ALLOW)$/i, 5) : true; snap("notify-permission");
    ok("notification permission " + (api >= 33 ? "prompt appears" : "not needed on this Android"), !!allow);
    await sleep(1500); const perm = await js(`return Notification.permission`); ok("notifications allowed", perm === "granted", perm);
    await js(`const d=new Date(Date.now()+3*86400000);const iso=d.toISOString().slice(0,10);state.upcoming=state.upcoming||[];state.upcoming.push({id:"u"+Date.now(),mtype:"IEP meeting",title:"IEP meeting",date:iso,time:"10:00",minutes:60,rem1:1440,rem2:60});save();return 1`);
    await sleep(5000);
    const pend = await js(`const L=Capacitor.registerPlugin("LocalNotifications");const p=await L.getPending();return (p.notifications||[]).filter(n=>n.id>=1000&&n.id<200000).length`);
    ok("meeting reminders scheduled with Android", pend >= 2, "pending: " + JSON.stringify(pend));
    await js(`new Notification("KidArmor test",{body:"Reminder check"});return 1`); await sleep(2500);
    const shown = /KidArmor test/.test(sh("dumpsys notification --noredact"));
    ok("a reminder notification shows on the phone", shown); sh("cmd statusbar expand-notifications"); await sleep(1500); snap("notification"); sh("cmd statusbar collapse");
  }
  if (step("restart")) { // ---- everything still there after the app is closed and reopened
    const before = await js(`return{entries:state.entries.length,docs:state.docs.length,name:state.child.name}`);
    sh(`am force-stop ${PKG}`); await sleep(1500); ok("app reopens after being closed", await launch(false)); await sleep(4000);
    const after = await js(`return{entries:state.entries.length,docs:state.docs.length,name:state.child.name}`);
    ok("records still there after reopening", JSON.stringify(before) === JSON.stringify(after), JSON.stringify(before) + " → " + JSON.stringify(after));
    const rid = fs.existsSync(`${OUT}/rec-id.txt`) ? fs.readFileSync(`${OUT}/rec-id.txt`, "utf8").split(" ") : null;
    if (rid) { const sz = await js(`const f=await getFile(${JSON.stringify(rid[0])});return f&&f.blob.size`); ok("recording still plays-ready after reopening", sz == rid[1], `${sz} bytes`) }
    snap("after-restart");
  }
  if (step("back")) { // ---- Android back button
    await js(`show("home");return 1`); await sleep(500); await click("#homeAdd"); await sleep(800);
    const where1 = await js(`return current`); sh("input keyevent 4"); await sleep(1200);
    ok("back button returns to Home from another screen", await js(`return current`) === "home", where1 + " → " + await js(`return current`));
    await js(`openViewer({name:"x.pdf",inline:true,thumb:""});return 1`); await sleep(500); sh("input keyevent 4"); await sleep(800);
    ok("back button closes an open file", await js(`return !document.querySelector(".viewer")`));
    sh("input keyevent 4"); await sleep(1500); const p = pid();
    ok("back button on Home puts the app away without crashing", !!p && topPkg() !== PKG, "pid " + p + ", on screen: " + topPkg());
    sh(`am start -n ${PKG}/.MainActivity`); await sleep(2000);
  }
  // ---- crashes and script errors over the whole run
  const log = adb("logcat", "-d"); fs.writeFileSync(`${OUT}/logcat.txt`, log);
  const fatal = (log.match(/FATAL EXCEPTION[\s\S]{0,400}/g) || []).filter(x => /kidarmor/i.test(x));
  ok("no app crashes", fatal.length === 0, fatal[0] || "");
  ok("no script errors in the app", jsErrors.length === 0, jsErrors.slice(0, 3).join(" | "));
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ api, results, jsErrors }, null, 1));
  const failed = results.filter(r => !r.pass).length;
  fs.writeFileSync(`${OUT}/summary.txt`, `Android API ${api}: ${results.length - failed} passed, ${failed} failed\n` + results.map(r => (r.pass ? "ok   " : "FAIL ") + r.name + (r.detail ? "  → " + r.detail : "")).join("\n") + "\n");
  console.log(fs.readFileSync(`${OUT}/summary.txt`, "utf8"));
  try { ws.close() } catch (e) { } process.exit(0) // results decide, not the exit code
}
main().catch(e => { console.log("  FAIL test crashed:", e.stack); fs.writeFileSync(`${OUT}/summary.txt`, "TEST CRASHED: " + e.stack + "\n" + JSON.stringify(results, null, 1)); process.exit(0) });
