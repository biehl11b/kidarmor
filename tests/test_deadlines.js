// Deadlines: added when a records or evaluation letter goes out, shown on the Plan tab and in "needs attention",
// moved along by the parent (consent signed, found eligible), put in the follow-up letter when late,
// and scheduled as real phone notifications in the app (native layer stubbed here).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const post = fs.readFileSync(path.join(__dirname, "../native/src/native-post.js"), "utf8");
const mk = native => `<!doctype html><html lang=en><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}${native ? "<script>" + post + "</script>" : ""}</body></html>`;
const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1 };

async function open(browser, native) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(native => {
    window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true;
    if (!native) return;
    window.KA_NATIVE = true; window.__scheduled = [];
    const ln = { checkPermissions: async () => ({ display: "granted" }), requestPermissions: async () => ({ display: "granted" }), getPending: async () => ({ notifications: [] }), cancel: async () => ({}), schedule: async o => { window.__scheduled.push(...o.notifications); return {} } };
    const any = new Proxy({}, { get: (t, k) => k === "then" ? undefined : k === "addListener" ? async () => ({ remove() { } }) : async () => ({}) });
    window.Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true, registerPlugin: n => n === "LocalNotifications" ? ln : any };
  }, native);
  const errors = []; page.on("pageerror", e => errors.push(e.message)); page.errors = errors;
  await page.route("https://demo.local/**", r => r.fulfill({ body: mk(native), contentType: "text/html" }));
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  await page.goto("https://demo.local/");
  await page.evaluate(() => { const c = migrate({ child: { name: "Sam Lee", school: "Bay Elementary", parent: "Pat Lee" }, plan: { type: "IEP", accoms: [] }, entries: [], docs: [] }); root.cases = [c]; root.active = 0; state = c; save(); show("home") });
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const page = await open(browser, false);
  // the example family never gets deadlines
  ok("example family doesn't get deadlines", await page.evaluate(() => { const s = state; state = migrate(JSON.parse(JSON.stringify(SAMPLE))); const r = addDeadline("records"); state = s; return r === null }));

  await page.evaluate(() => { show("letters"); $("#l-kind").value = "records"; renderLetter(); letterSent("records") }); await page.waitForTimeout(2900);
  let d = await page.evaluate(() => state.deadlines);
  ok("records letter adds a 45-day deadline", d.length === 1 && d[0].dk === "records" && d[0].due === await page.evaluate(() => addDays(today(), 45)), JSON.stringify(d));
  await page.evaluate(() => letterSent("records")); await page.waitForTimeout(2900);
  ok("sending it twice the same day doesn't duplicate", (await page.evaluate(() => state.deadlines.length)) === 1);
  await page.evaluate(() => show("plan"));
  ok("Plan tab shows the deadline", await page.locator("#dlPanel").isVisible() && /School records/.test(await page.locator("#dlList").innerText()));
  ok("says federal rule and to check the state", /45 days/.test(await page.locator("#dlList").innerText()) && /state may set shorter/.test(await page.locator("#dlState").innerText()));

  // evaluation request -> consent signed -> eligible
  await page.evaluate(() => letterSent("eval")); await page.waitForTimeout(2900);
  await page.evaluate(() => show("plan"));
  await page.click("[data-dlc]"); await page.fill("#adDate", "2026-11-02"); await page.click("#adOk"); await page.waitForTimeout(200);
  d = await page.evaluate(() => openDeadlines().map(x => x.dk + ":" + x.date + ">" + x.due));
  ok("consent date starts the 60-day evaluation clock", d.includes("eval:2026-11-02>2027-01-01") && !d.some(x => x.startsWith("evalreq")), d.join(" "));
  await page.click("[data-dli]"); await page.fill("#adDate", "2026-11-10"); await page.click("#adOk"); await page.waitForTimeout(200);
  d = await page.evaluate(() => openDeadlines().map(x => x.dk + ":" + x.due));
  ok("found eligible starts the 30-day IEP meeting clock", d.includes("iep:2026-12-10") && !d.some(x => x.startsWith("eval:")), d.join(" "));
  ok("empty date is refused", await page.evaluate(() => { let called = false; askDate("q", () => called = true); document.querySelector("#adDate").value = ""; document.querySelector("#adOk").click(); const msg = document.querySelector("#adErr").textContent; closeSheet(); return !called && /pick a date/.test(msg) }));

  // due soon and late
  await page.evaluate(() => { const x = state.deadlines.find(y => y.dk === "records"); x.due = addDays(today(), 5); save() });
  ok("due within a week shows on the case screen", (await page.evaluate(() => needsAttention().map(x => x[0]).join(" | "))).includes("School records: records are due on"));
  await page.evaluate(() => { const x = state.deadlines.find(y => y.dk === "records"); x.due = addDays(today(), -2); save(); show("plan") });
  ok("late shows as past due", /Past due/.test(await page.locator("#dlList").innerText()));
  await page.click("[data-dlf]"); await page.waitForTimeout(200);
  const letter = await page.locator("#letter").innerText();
  ok("follow-up letter opens with the late deadline in it", (await page.evaluate(() => $("#l-kind").value)) === "followup" && /education records/.test(letter) && /45 days/.test(letter), letter.slice(-400));
  await page.evaluate(() => show("plan"));
  const before = await page.evaluate(() => openDeadlines().length); await page.locator("[data-dld]").first().click();
  ok("Done removes it from the list", (await page.evaluate(() => openDeadlines().length)) === before - 1);
  ok("bad saved data can't break it", await page.evaluate(() => { const m = migrate({ child: {}, plan: { accoms: [] }, entries: [], docs: [], deadlines: "oops" }); return Array.isArray(m.deadlines) }));
  ok("no script errors (web)", !page.errors.length, page.errors.join("; "));

  // phone app: real notifications scheduled 3 days before and on the day
  const nat = await open(browser, true);
  await nat.evaluate(() => { addDeadline("records", addDays(today(), -1), true) }); await nat.waitForTimeout(2600);
  const sch = await nat.evaluate(() => window.__scheduled.map(n => n.title + " | " + n.body + " | " + new Date(n.schedule.at).toISOString().slice(0, 10)));
  const due = await nat.evaluate(() => addDays(today(), 44)), three = await nat.evaluate(() => addDays(today(), 41));
  ok("phone app schedules a reminder 3 days before", sch.some(s => s.startsWith("School records (Sam)") && s.endsWith(three) && /in 3 days/.test(s)), sch.join(" || "));
  ok("phone app schedules a reminder on the day", sch.some(s => s.startsWith("School records (Sam)") && s.endsWith(due) && /today/.test(s)));
  ok("phone app: no in-app duplicate checker", await nat.evaluate(() => { const before = root.cases[0].deadlines[0].fired.length; root.cases[0].deadlines[0].due = today(); checkDeadlines(); return root.cases[0].deadlines[0].fired.length === before }));
  ok("no script errors (phone app)", !nat.errors.length, nat.errors.join("; "));
  await browser.close();
})();
