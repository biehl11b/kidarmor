// Opens the App Store (Release) build of KidArmor the way an App Reviewer would, on one virtual iPhone/iPad:
// first open, the Welcome screen, a Terms link and its "Read it on our website" button (must open Safari
// and leave KidArmor running), the agree box, Continue, then the setup screen; rotate (iPad); no crash.
// Needs: UDID, APP (Release App.app), DEVICE, OUT; Appium running on 4723.
import { remote } from "webdriverio"; import { execFileSync } from "child_process"; import fs from "fs";
const { UDID, APP, DEVICE = "iPhone", OUT = "store" } = process.env; fs.mkdirSync(OUT, { recursive: true });
const BUNDLE = "com.coastlinecode.kidarmor"; const sleep = ms => new Promise(r => setTimeout(r, ms));
const xc = (...a) => { try { return execFileSync("xcrun", a, { encoding: "utf8", timeout: 300000, maxBuffer: 64e6 }) } catch (e) { return (e.stdout || "") + (e.stderr || "") } };
const lines = []; let fails = 0;
const log = (kind, what, detail = "") => { if (kind === "FAIL") fails++; const s = `${kind.padEnd(4)} ${what}${detail ? "  → " + String(detail).slice(0, 300) : ""}`; console.log(s); lines.push(s) };
const shot = name => xc("simctl", "io", UDID, "screenshot", `${OUT}/${name}.png`);
let d;
async function find(pred, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { try { const e = await d.$(`-ios predicate string:${pred}`); if (await e.isExisting()) return e } catch (e) { } await sleep(1000) } return null }
async function state(b = BUNDLE) { try { return await d.execute("mobile: queryAppState", { bundleId: b }) } catch (e) { return "?" } }
async function main() {
  xc("simctl", "install", UDID, APP);
  const t0 = Date.now(); xc("simctl", "launch", UDID, BUNDLE);
  await sleep(5000); shot("1-after-5s"); await sleep(10000); shot("2-after-15s");
  d = await remote({ hostname: "127.0.0.1", port: 4723, logLevel: "error", connectionRetryTimeout: 1800000, connectionRetryCount: 0,
    capabilities: { platformName: "iOS", "appium:automationName": "XCUITest", "appium:udid": UDID, "appium:bundleId": BUNDLE, "appium:deviceName": DEVICE,
      ...(process.env.WDA_DD ? { "appium:derivedDataPath": process.env.WDA_DD, "appium:usePrebuiltWDA": true } : {}), ...(process.env.IOSVER ? { "appium:platformVersion": process.env.IOSVER } : {}),
      "appium:noReset": true, "appium:autoLaunch": false, "appium:newCommandTimeout": 900, "appium:wdaLaunchTimeout": 600000, "appium:wdaConnectionTimeout": 600000, "appium:autoAcceptAlerts": false } });
  const size = await d.getWindowSize(); log("info", "device", `${DEVICE} iOS ${process.env.IOSVER || "?"}, window ${size.width}x${size.height}`);
  await d.execute("mobile: activateApp", { bundleId: BUNDLE });
  const welcome = await find(`label == "Welcome to KidArmor"`, 90000);
  const box = await find(`label BEGINSWITH "I have read and agree"`, 30000);
  log(welcome && box ? "ok" : "FAIL", "Welcome screen with the agree box shows", welcome ? `about ${Math.round((Date.now() - t0) / 1000)} s after opening` : "not seen");
  shot("3-welcome"); fs.writeFileSync(`${OUT}/welcome-source.xml`, await d.getPageSource());
  // a Terms link opens KidArmor's own viewer; its "Read it on our website" button must open Safari
  const terms = await find(`label == "Terms of Use" AND (type == "XCUIElementTypeLink" OR type == "XCUIElementTypeStaticText")`, 5000);
  if (terms) {
    await terms.click(); await sleep(2000);
    const site = await find(`label CONTAINS "Read it on our website"`, 10000); log(site ? "ok" : "FAIL", "Terms of Use opens inside the app"); shot("4-terms");
    if (site) {
      await site.click(); await sleep(5000); shot("5-website");
      const ka = await state(), safari = await state("com.apple.mobilesafari");
      log(safari === 4 && (ka === 3 || ka === 2 || ka === 4) ? "ok" : "FAIL", "\"Read it on our website\" opens Safari and KidArmor keeps running", `Safari state ${safari}, KidArmor state ${ka}`);
      await d.execute("mobile: activateApp", { bundleId: BUNDLE }); await sleep(2000);
      const still = await find(`label CONTAINS "Read it on our website"`, 8000); log(still ? "ok" : "FAIL", "back in KidArmor, still on the same screen");
      const close = await find(`type == "XCUIElementTypeButton" AND label == "Close"`, 5000); if (close) { await close.click(); await sleep(1500) }
    }
  } else log("info", "Terms of Use link not found by label", "skipped link check");
  const box2 = await find(`label BEGINSWITH "I have read and agree"`, 10000);
  if (box2) { await box2.click(); await sleep(1500) }
  let go = await find(`type == "XCUIElementTypeButton" AND label == "Continue"`, 10000);
  const en = go ? await go.isEnabled() : false; log(en ? "ok" : "FAIL", "checking the box turns on Continue", go ? (en ? "enabled" : "still off") : "no Continue button");
  if (go) { await go.click(); await sleep(2500) }
  const intro = await find(`label CONTAINS "how KidArmor works"`, 30000); shot("6-after-continue");
  log(intro ? "ok" : "FAIL", "Continue opens the 'how it works' intro");
  const tourBtn = await find(`type == "XCUIElementTypeButton" AND label == "Show me how it works"`, 8000);
  if (tourBtn) { await tourBtn.click(); await sleep(2500);
    const t1 = await find(`label CONTAINS[c] "step 1 of 6"`, 15000); shot("6b-tour"); log(t1 ? "ok" : "FAIL", "'Show me how it works' starts the tour");
    const nx = await find(`type == "XCUIElementTypeButton" AND label == "Next"`, 5000); if (nx) { await nx.click(); await sleep(2000) }
    const t2 = await find(`label CONTAINS[c] "step 2 of 6"`, 10000); log(t2 ? "ok" : "FAIL", "the tour's Next button works");
    const bk = await find(`type == "XCUIElementTypeButton" AND label == "Back"`, 5000); if (bk) { await bk.click(); await sleep(1500) }
    const sk = await find(`type == "XCUIElementTypeButton" AND label == "Skip the tour"`, 8000); if (sk) { await sk.click(); await sleep(2500) }
  } else log("FAIL", "intro offers 'Show me how it works'");
  const setup = await find(`label CONTAINS "set up KidArmor"`, 30000); shot("6c-setup");
  log(setup ? "ok" : "FAIL", "skipping the tour opens setup");
  if (/iPad/i.test(DEVICE)) { // App Review often uses an iPad; the iPhone-only app runs there in a phone-size window
    try { await d.setOrientation("LANDSCAPE"); await sleep(2500); shot("7-landscape"); await d.setOrientation("PORTRAIT"); await sleep(2000) } catch (e) { log("info", "rotate", e.message) }
    const s2 = await find(`label CONTAINS "set up KidArmor"`, 10000); log(s2 ? "ok" : "FAIL", "still fine after rotating");
  }
  const st = await state(); log(st === 4 ? "ok" : "FAIL", "app still running at the end", `state ${st}`);
}
try { await main() } catch (e) { log("FAIL", "test stopped", e.message) }
try { if (d) await d.deleteSession() } catch (e) { }
const crashes = xc("simctl", "spawn", UDID, "log", "show", "--last", "15m", "--style", "compact", "--predicate", 'process == "App" AND (messageType == fault OR eventMessage CONTAINS[c] "crash" OR eventMessage CONTAINS "Terminating")');
fs.writeFileSync(`${OUT}/app-faults.txt`, crashes);
const reports = (() => { try { return execFileSync("bash", ["-c", `ls ~/Library/Logs/DiagnosticReports 2>/dev/null | grep -iE '^App[-_.]' || true`], { encoding: "utf8" }).trim() } catch (e) { return "" } })();
log(reports ? "FAIL" : "ok", "no crash reports", reports);
const head = `${DEVICE} (store build): ${lines.filter(l => l.startsWith("ok")).length} passed, ${fails} failed`;
fs.writeFileSync(`${OUT}/summary.txt`, head + "\n" + lines.join("\n") + "\n"); console.log(head);
process.exit(0);
