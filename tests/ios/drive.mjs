// KidArmor iPhone test. Drives the real app on a virtual iPhone through Appium:
// the app's screens through the web view, and iPhone screens (permission alerts, photo picker,
// calendar, Face ID, share sheet) as native elements. Writes results to $OUT.
import { remote } from "webdriverio";
import { execFileSync } from "child_process";
import fs from "fs";
const BUNDLE = "com.coastlinecode.kidarmor";
const { UDID, APP, DEVICE = "iPhone", OUT = "sim" } = process.env;
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const results = []; let shot = 0, d, web = null; const jsErrors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bad = v => v && typeof v === "object" && v.__err;
const ok = (name, pass, detail = "") => { if (bad(pass)) { detail = pass.__err; pass = false } if (detail && typeof detail === "object") detail = JSON.stringify(detail); results.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log((pass ? "  ok   " : "  FAIL ") + name + (detail ? "  → " + String(detail).slice(0, 300) : "")) };
const info = (name, detail) => { if (detail && typeof detail === "object") detail = JSON.stringify(detail); results.push({ name, pass: true, info: true, detail: String(detail).slice(0, 300) }); console.log("  info " + name + "  → " + String(detail).slice(0, 300)) };
const xc = (...a) => { try { return execFileSync("xcrun", a, { encoding: "utf8", timeout: 60000, maxBuffer: 64e6 }) } catch (e) { return (e.stdout || "") + (e.stderr || "") } };
const snap = label => { const f = `${OUT}/${String(++shot).padStart(2, "0")}-${label}.png`; xc("simctl", "io", UDID, "screenshot", "--type=png", f); return f };
const step = n => !ONLY.length || ONLY.includes(n);
const dataDir = () => xc("simctl", "get_app_container", UDID, BUNDLE, "data").trim();

// ---------- the app's web view ----------
async function toWeb(ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const c = await d.getContexts(); const w = c.map(x => typeof x === "string" ? x : x.id).find(x => /^WEBVIEW/.test(x)); if (w) { await d.switchContext(w); web = w; const r = await js(`return location.href`); if (typeof r === "string") return true } } catch (e) { }
    await sleep(1500)
  }
  return false
}
async function js(body) {
  try {
    return await d.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${body}})().then(v=>done(v===undefined?null:v),e=>done({__err:String(e&&e.stack||e)}))`)
  } catch (e) { return { __err: String(e.message || e).slice(0, 300) } }
}
async function waitFor(expr, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(`return !!(${expr})`) === true) return true; await sleep(600) } return false }
const click = sel => js(`const e=document.querySelector(${JSON.stringify(sel)});if(!e)return "missing";e.scrollIntoView({block:"center"});e.click();return "ok"`);
const kick = body => js(`setTimeout(async()=>{try{${body}}catch(e){window.__kick=String(e)}},10);return 1`); // start something that waits on a native screen
async function grabErrors() { const e = await js(`const a=window.__kaErrs||[];window.__kaErrs=[];return a`); if (Array.isArray(e)) jsErrors.push(...e) }

// ---------- iPhone screens ----------
async function native(fn) { await d.switchContext("NATIVE_APP"); try { return await fn() } finally { if (web) try { await d.switchContext(web) } catch (e) { } } }
function elements(xml) {
  return [...xml.matchAll(/<(XCUIElementType\w+)\s([^>]*)>/g)].map(m => { const a = m[2], g = k => (a.match(new RegExp(" ?" + k + '="([^"]*)"')) || [])[1] || ""; return { type: m[1], name: g("name"), label: g("label"), visible: g("visible") !== "false", x: +g("x") + (+g("width") >> 1), y: +g("y") + (+g("height") >> 1), w: +g("width") } })
}
const source = () => native(async () => { try { return await d.getPageSource() } catch (e) { return "" } });
async function alertButtons() { return native(async () => { try { return await d.execute("mobile: alert", { action: "getButtons" }) } catch (e) { return null } }) }
async function tapAlert(re, tries = 8) {
  for (let i = 0; i < tries; i++) { const b = await alertButtons(); if (b && b.length) { const pick = b.find(x => re.test(x)); if (pick) { await native(() => d.execute("mobile: alert", { action: "accept", buttonLabel: pick })); await sleep(1200); return pick } console.log("    alert buttons:", b.join(" | ")) } await sleep(1000) }
  return null
}
async function tapText(re, tries = 8, types = /Button|Cell|StaticText|Image|Other/) {
  for (let i = 0; i < tries; i++) {
    const el = elements(await source()).find(e => e.visible && types.test(e.type) && (re.test(e.label) || re.test(e.name)) && e.w > 0);
    if (el) { await native(() => d.execute("mobile: tap", { x: el.x, y: el.y })); await sleep(1200); return el }
    await sleep(1000)
  }
  return null
}
const screenText = async () => elements(await source()).filter(e => e.visible && (e.label || e.name)).map(e => e.label || e.name).filter((v, i, a) => a.indexOf(v) === i).slice(0, 25).join(" | ");

// ---------- layout: nothing wider than the screen, nothing under the notch or home bar ----------
const LAYOUT = `
  const t=document.createElement("div");t.style.cssText="position:fixed;top:0;left:0;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0;visibility:hidden";document.body.appendChild(t);
  const cs=getComputedStyle(t),top=parseFloat(cs.paddingTop)||0,bot=parseFloat(cs.paddingBottom)||0;t.remove();
  const W=innerWidth,H=innerHeight,wide=[],under=[];
  const vis=e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return null;const s=getComputedStyle(e);if(s.visibility==="hidden"||s.display==="none"||+s.opacity===0)return null;return r};
  const inScroller=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const o=getComputedStyle(p).overflowX;if(o==="auto"||o==="scroll"||o==="hidden")return true}return false};
  document.querySelectorAll("body *").forEach(e=>{if(e.closest(".toast"))return;const r=vis(e);if(!r)return;
    if((r.right>W+2||r.left<-2)&&!inScroller(e)&&getComputedStyle(e).position!=="fixed")wide.push((e.id?"#"+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==="string"?"."+e.className.split(" ")[0]:""))+" "+Math.round(r.left)+".."+Math.round(r.right));
    if(/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName)&&r.bottom>0&&r.top<H&&(r.top<top-1||r.bottom>H-bot+1)&&getComputedStyle(e).position==="fixed")under.push((e.id||e.textContent.trim().slice(0,20))+" y"+Math.round(r.top)+"-"+Math.round(r.bottom))});
  return {W,H,top,bot,scrollW:document.documentElement.scrollWidth,wide:wide.slice(0,6),under:under.slice(0,6)}`;
async function layout(label) {
  const l = await js(LAYOUT); snap("screen-" + label);
  if (!l || l.__err) { ok(`${label}: screen fits`, false, JSON.stringify(l)); return }
  ok(`${label}: nothing wider than the screen`, l.scrollW <= l.W + 1 && !l.wide.length, `screen ${l.W}x${l.H}, page ${l.scrollW} wide ${l.wide.join(", ")}`);
  ok(`${label}: buttons clear of the notch and home bar`, !l.under.length, `safe top ${l.top}, bottom ${l.bot} ${l.under.join(", ")}`);
}

// ---------- the walkthrough ----------
async function main() {
  // the first start can take over 10 minutes on the test Macs (the iPhone driver warms up), so try again
  const opts = {
    hostname: "127.0.0.1", port: 4723, logLevel: "error", connectionRetryTimeout: 1800000, connectionRetryCount: 0,
    capabilities: { platformName: "iOS", "appium:automationName": "XCUITest", "appium:udid": UDID, "appium:app": APP, "appium:bundleId": BUNDLE, "appium:deviceName": DEVICE, ...(process.env.WDA_DD ? { "appium:derivedDataPath": process.env.WDA_DD, "appium:usePrebuiltWDA": true } : {}), ...(process.env.IOSVER ? { "appium:platformVersion": process.env.IOSVER } : {}),
      "appium:noReset": false, "appium:newCommandTimeout": 900, "appium:wdaLaunchTimeout": 600000, "appium:wdaConnectionTimeout": 600000,
      "appium:webviewConnectTimeout": 30000, "appium:autoAcceptAlerts": false, "appium:shouldTerminateApp": true, "appium:reduceMotion": true }
  };
  for (let i = 1; i <= 3 && !d; i++) { try { d = await remote(opts) } catch (e) { console.log(`    start try ${i} failed: ${String(e.message).slice(0, 120)}`); if (i === 3) throw e; await sleep(20000) } }

  await d.setTimeout({ script: 90000 });
  const ios = process.env.IOSVER || "?";
  console.log("Device:", DEVICE, ios);
  ok("app opens and its screen loads", await toWeb(90000)); await sleep(3000);
  ok("phone features load (native mode)", await js(`return window.KA_NATIVE===true&&Capacitor.getPlatform()==="ios"`), await js(`return navigator.userAgent`));
  // first-run screens as a new parent sees them
  info("first screen", await js(`return (document.querySelector(".agreescreen,.wizard")||document.body).innerText.slice(0,120)`));
  await layout("first-open");
  await js(`localStorage.setItem("ka_test_skip","1");location.reload();return 1`); await sleep(5000); await toWeb(30000);
  await click("#startOwn"); await sleep(800);
  await js(`document.querySelector("#s-child").value="Ava Test";document.querySelector("#s-parent").value="Josh";document.querySelector("#setupForm button[type=submit]").click();return 1`);
  await sleep(1500); await click("#fsDone"); await sleep(500); await click('nav.tabs button[data-v="home"]'); await sleep(800);
  ok("child added", await js(`return !!(state&&state.child&&state.child.name==="Ava Test")`));
  await grabErrors();

  if (step("layout")) for (const v of ["home", "add", "plan", "letters", "reports", "res", "me"]) { await js(`closeSheet&&closeSheet();show(${JSON.stringify(v)});scrollTo(0,0);return 1`); await sleep(900); await layout(v) }

  if (step("record")) { // ---- record a meeting (no microphone on the test Mac, so the sound part is checked on a real iPhone)
    await js(`show("home");return 1`); await sleep(500);
    await click("#homeRecord"); await sleep(1000); await click("#recStart"); await sleep(1500);
    const choice = await js(`const b=[...document.querySelectorAll("button")].find(b=>/Use on this phone only|on this phone/i.test(b.textContent));if(b){b.click();return "chose on-phone"}return "no choice screen"`); console.log("   ", choice); await sleep(1500);
    if (await js(`return !document.querySelector("#recStop")||document.querySelector("#recStop").offsetParent===null`)) { await click("#recStart"); await sleep(1500) }
    const a = await tapAlert(/^(Allow|OK)$/i, 4); if (a) console.log("    allowed:", a); await tapAlert(/^(Allow|OK)$/i, 2);
    snap("recording"); await sleep(5000);
    const t = await js(`return (document.querySelector("#recTime")||{}).textContent||""`);
    const mime = await js(`return window.MediaRecorder?["audio/mp4","audio/webm","audio/webm;codecs=opus"].map(m=>m+":"+MediaRecorder.isTypeSupported(m)).join(" "):"no MediaRecorder"`);
    info("recording formats this iPhone supports", mime);
    if (/0[0-9]:0[2-9]|0[0-9]:[1-5][0-9]/.test(t)) {
      ok("recording timer runs", true, t);
      await click("#recTold"); await sleep(500); await click("#recStop");
      const done = await waitFor(`document.querySelector(".sheet #smDone")`, 60000); snap("after-stop");
      const r = await js(`const e=state.entries[0];if(!e||!e.recordings||!e.recordings[0])return null;const m=e.recordings[0];const f=await getFile(m.id);return{type:m.type,size:f&&f.blob.size,secs:e.recordingSeconds}`);
      ok("recording saved on the phone", r && r.size > 500 && /^audio\//.test(r.type), JSON.stringify(r));
      if (done) await click(".sheet #smDone");
    } else info("recording (needs a real iPhone microphone)", `timer "${t}"; on screen: ${await js(`return (document.querySelector(".sheet,.view:not([hidden])")||document.body).innerText.slice(0,160)`)}`);
    await js(`closeSheet&&closeSheet();show("home");return 1`); await grabErrors();
  }

  if (step("photo")) { // ---- add a photo through the iPhone photo picker
    xc("simctl", "addmedia", UDID, new URL("../android/report-card.png", import.meta.url).pathname);
    await js(`show("plan");return 1`); await sleep(800);
    const before = await js(`return state.docs.length`);
    await js(`document.querySelector("#d-name").value="Report card";document.querySelector("#d-file").click();return 1`); await sleep(2500); snap("picker-menu");
    console.log("    on screen:", await screenText());
    let picked = await tapText(/^Photo Library$/i, 4);
    if (picked) { await sleep(3000); snap("picker"); console.log("    picker:", await screenText());
      const img = await tapText(/^Photo,|^Image|^Photo$/i, 5, /Image|Cell|Other|Button/); if (img) { await sleep(1500); await tapText(/^(Add|Done|Choose)$/i, 2, /Button/) } picked = !!img }
    ok("photo picker opens and a photo can be picked", !!picked, await screenText());
    let saved = await waitFor(`state.docs.length>${before}`, 15000);
    if (!saved) { // still check that a picked file saves, by handing it to the page directly
      for (let i = 0; i < 3; i++) { if (!(await tapText(/^(Cancel|Close)$/i, 1, /Button/))) break }
      await js(`const b=await (await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")).blob();const f=new File([b],"report-card.png",{type:"image/png"});const i=document.querySelector("#d-file");const dt=new DataTransfer();dt.items.add(f);i.files=dt.files;i.dispatchEvent(new Event("change",{bubbles:true}));return 1`);
      saved = await waitFor(`state.docs.length>${before}`, 10000); info("photo saved when handed to the page", saved) }
    const dd = await js(`const d=state.docs[state.docs.length-1];if(!d)return null;const f=await getFile(d.files[0].id);let rd=-1;try{rd=(await f.blob.arrayBuffer()).byteLength}catch(e){}return{name:d.name,type:f&&f.type,readBytes:rd}`);
    ok("photo saved with the case", saved && dd && dd.readBytes > 50, JSON.stringify(dd)); snap("photo-saved"); await grabErrors();
  }

  if (step("remind")) { // ---- reminders: notification permission + scheduled alerts
    await js(`show("home");return 1`); await kick(`askNotify()`); await sleep(2000); snap("notify-permission");
    const a = await tapAlert(/^Allow$/i, 6);
    ok("notification permission prompt appears", !!a, a || await screenText());
    await sleep(1500); const perm = await js(`return Notification.permission`); ok("notifications allowed", perm === "granted", perm);
    await js(`const d=new Date(Date.now()+3*86400000);const iso=d.toISOString().slice(0,10);state.upcoming=state.upcoming||[];state.upcoming.push({id:"u"+Date.now(),mtype:"IEP meeting",title:"IEP meeting",date:iso,time:"10:00",minutes:60,rem1:1440,rem2:60});save();return 1`);
    await sleep(4000);
    const pend = await js(`const L=Capacitor.registerPlugin("LocalNotifications");const p=await L.getPending();return (p.notifications||[]).filter(n=>n.id>=1000&&n.id<200000).length`);
    ok("meeting reminders scheduled with the iPhone", pend >= 2, "pending: " + JSON.stringify(pend)); await grabErrors();
  }

  if (step("calendar")) { // ---- add the meeting to the iPhone calendar
    await js(`if(!(state.upcoming||[]).length){const d=new Date(Date.now()+4*86400000);state.upcoming=[{id:"u"+Date.now(),mtype:"IEP meeting",title:"IEP meeting",date:d.toISOString().slice(0,10),time:"10:00",minutes:60,rem1:1440,rem2:60}];save()}return 1`);
    await kick(`window.__cal=await addToCalendar(state.upcoming[state.upcoming.length-1])`); await sleep(3000);
    await tapAlert(/^(Allow|OK|Allow Full Access)$/i, 2); await sleep(1500); snap("calendar");
    console.log("    on screen:", await screenText());
    const add = await tapText(/^Add$/i, 6, /Button/);
    ok("calendar screen opens with the meeting", !!add, await screenText());
    const done = await waitFor(`window.__cal===true`, 10000);
    ok("meeting added to the iPhone calendar", done, await js(`return String(window.__cal)+" "+(window.__kick||"")`)); await grabErrors();
  }

  if (step("faceid")) { // ---- Face ID sign-in
    await native(() => d.execute("mobile: enrollBiometric", { isEnabled: true })); await sleep(1500);
    ok("Face ID available to the app", await js(`return await bioSupported()`));
    await kick(`window.__bio="waiting";try{await bioEnroll();window.__bio="on"}catch(e){window.__bio="failed: "+(e&&e.message||e)}`); await sleep(2500);
    const a = await tapAlert(/^(OK|Allow)$/i, 4); console.log("    Face ID permission:", a); await sleep(1500); snap("faceid");
    await native(() => d.execute("mobile: sendBiometricMatch", { type: "faceId", match: true }));
    await waitFor(`window.__bio!=="waiting"`, 10000);
    ok("Face ID turns on", await js(`return window.__bio`) === "on", await js(`return window.__bio`));
    await kick(`window.__unl="waiting";window.__unl=await bioUnlock()`); await sleep(2000);
    await native(() => d.execute("mobile: sendBiometricMatch", { type: "faceId", match: true })); await waitFor(`window.__unl!=="waiting"`, 10000);
    ok("Face ID unlocks the app", await js(`return window.__unl`) === true, await js(`return String(window.__unl)`));
    await kick(`window.__unl="waiting";window.__unl=await bioUnlock()`); await sleep(2000);
    await native(() => d.execute("mobile: sendBiometricMatch", { type: "faceId", match: false })); await sleep(2000); await tapText(/^Cancel$/i, 3, /Button/); await waitFor(`window.__unl!=="waiting"`, 10000);
    ok("a face that doesn't match is refused", await js(`return window.__unl`) === false, await js(`return String(window.__unl)`)); await grabErrors();
  }

  if (step("pdf")) { // ---- make the PDF case binder and share it
    await js(`show("home");return 1`); await sleep(800); await click("#homeBinder");
    const opened = await waitFor(`document.querySelector(".viewer canvas, .viewer .vbody img, .viewer .vbody embed, .viewer .pdfpage")`, 45000); snap("binder");
    const pdfjs = await js(`try{await getPdfjs();return "pdf viewer loaded"}catch(e){return "pdf viewer failed: "+(e&&e.message)}`);
    ok("PDF preview library loads", /loaded/.test(pdfjs), pdfjs);
    ok("PDF binder is made and shows", opened, await js(`return (document.querySelector(".viewer .vbody")||{}).innerText||"no viewer"`));
    await click("#vdl"); await sleep(5000); snap("share-sheet");
    let files = ""; try { files = fs.readdirSync(dataDir() + "/Library/Caches/kidarmor-out").join(", ") } catch (e) { files = "none: " + e.message }
    ok("PDF file written for sharing", /Binder.*\.pdf/i.test(files), files);
    const txt = await screenText(); ok("iPhone share sheet opens", /Save to Files|Copy|AirDrop|Messages|Mail|Print/i.test(txt), txt);
    await tapText(/^Close$/i, 3, /Button/); await sleep(1000); await click("#vclose"); await sleep(500); await grabErrors();
  }

  if (step("restart")) { // ---- everything still there after the app is closed and reopened
    const before = await js(`return{entries:state.entries.length,docs:state.docs.length,name:state.child.name}`);
    await grabErrors(); await d.terminateApp(BUNDLE); await sleep(1500); await d.activateApp(BUNDLE); await sleep(4000);
    ok("app reopens after being closed", await toWeb(60000)); await sleep(3000);
    // Face ID was turned on above, so it may ask for a face first
    if (await js(`return !!document.querySelector(".lockscreen")`)) { await native(() => d.execute("mobile: sendBiometricMatch", { type: "faceId", match: true })); await sleep(2500) }
    const after = await js(`return{entries:state.entries.length,docs:state.docs.length,name:state.child.name}`);
    ok("records still there after reopening", JSON.stringify(before) === JSON.stringify(after), JSON.stringify(before) + " → " + JSON.stringify(after));
    snap("after-restart"); await grabErrors();
  }

  // ---- crashes and script errors over the whole run
  const st = await native(() => d.execute("mobile: queryAppState", { bundleId: BUNDLE }));
  ok("app still running at the end", st === 4 || st === 3, "state " + st);
  let crashes = []; try { const dir = process.env.HOME + "/Library/Logs/DiagnosticReports"; crashes = fs.readdirSync(dir).filter(f => /^App[-_]/.test(f) && fs.statSync(dir + "/" + f).mtimeMs > START) } catch (e) { }
  ok("no app crashes", !crashes.length, crashes.join(", "));
  ok("no script errors in the app", jsErrors.length === 0, jsErrors.slice(0, 3).join(" | "));
  const failed = results.filter(r => !r.pass).length;
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ device: DEVICE, ios, results, jsErrors }, null, 1));
  fs.writeFileSync(`${OUT}/summary.txt`, `${DEVICE} (iOS ${ios}): ${results.filter(r => r.pass && !r.info).length} passed, ${failed} failed\n` + results.map(r => (r.info ? "info " : r.pass ? "ok   " : "FAIL ") + r.name + (r.detail ? "  → " + r.detail : "")).join("\n") + "\n");
  console.log(fs.readFileSync(`${OUT}/summary.txt`, "utf8"));
  try { await d.deleteSession() } catch (e) { }
  process.exit(0) // results decide, not the exit code
}
const START = Date.now();
main().catch(async e => { console.log("  FAIL test crashed:", e.stack); snap("crash"); fs.writeFileSync(`${OUT}/summary.txt`, `${DEVICE}: TEST CRASHED: ${e.stack}\n` + results.map(r => (r.pass ? "ok   " : "FAIL ") + r.name + "  → " + r.detail).join("\n") + "\n"); try { await d.deleteSession() } catch (x) { } process.exit(0) });
