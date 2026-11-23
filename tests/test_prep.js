// Meeting prep ("Get ready") and the example family: quick checks on the page itself.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await page.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("https://demo.local/**", r => r.fulfill({ body: page_, contentType: "text/html" }));
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  await page.route("https://demo.local/vendor/**", r => r.fulfill({ path: __dirname + "/../vendor/" + r.request().url().split("/vendor/")[1].split("?")[0], contentType: "application/javascript" }));
  const ok = (name, cond, extra = "") => { console.log((cond ? "  ok   " : "  FAIL ") + name + (extra ? "  → " + extra : "")); if (!cond) process.exitCode = 1 };

  await page.goto("https://demo.local/");
  ok("fresh visitor sees the welcome with an example button", await page.locator("#seeExample").isVisible());
  await page.click("#seeExample"); await page.waitForTimeout(300);
  ok("example family opens", await page.evaluate(() => state.example && state.child.name === "Jordan Miles"));
  ok("example banner shows", await page.locator("#exampleBar").isVisible());
  ok("upcoming meeting has Get ready", await page.locator("[data-ump]").isVisible());
  await page.screenshot({ path: __dirname + "/prep-home.png" });

  await page.click("[data-ump]"); await page.waitForTimeout(300);
  const qs = await page.locator("[data-pq]").count();
  ok("suggested questions from the records", qs >= 5, qs + " questions");
  const qtext = await page.locator(".prepq span").allInnerTexts();
  ok("question about extended time not given", qtext.some(t => /Extended time/.test(t) && /wasn't provided/.test(t)), qtext[0]);
  ok("question about teachers not knowing the plan", qtext.some(t => /teachers told about the plan/.test(t)));
  ok("question about bullying safety", qtext.some(t => /bullying incidents/.test(t) && /safe/.test(t)));
  ok("question about last meeting's promises", qtext.some(t => /agreed/.test(t)));
  ok("recording notice advice shows", /a day before|24 hours/.test(await page.locator(".sheet").innerText()));
  const mail = await page.getAttribute("#ppTell", "href");
  ok("notice email goes to the 504 coordinator", /^mailto:tdaniels%40harborms/.test(mail), mail.slice(0, 60));
  await page.click("#ppDraft");
  const conc = await page.inputValue("#ppConc");
  ok("concerns draft written from records", /Extended time/.test(conc) && /safety/.test(conc), conc.slice(0, 120));
  await page.fill("#ppGoals", "Every teacher gets the 504 plan\nA safety plan for lunch and the bus");
  await page.locator("[data-pc=draft]").check();
  await page.screenshot({ path: __dirname + "/prep-sheet.png", fullPage: true });
  await page.click("#ppSave"); await page.waitForTimeout(200);
  const saved = await page.evaluate(() => state.upcoming[0].prep);
  ok("plan saved", saved && /safety plan/.test(saved.goals) && saved.done.includes("draft") && saved.picked.length === qs);
  ok("button now says My meeting plan", /My meeting plan/.test(await page.locator("[data-ump]").innerText()));

  const bytes = await page.evaluate(async () => { const m = state.upcoming[0]; const b = await buildPrepPdf(m, prepData(m)); return Array.from(b) });
  const pdf = await PDFDocument.load(Uint8Array.from(bytes));
  ok("meeting plan PDF made", pdf.getPageCount() >= 1, pdf.getPageCount() + " page(s)");
  fs.writeFileSync(__dirname + "/sample-meeting-plan.pdf", Uint8Array.from(bytes));

  // a parent with no records and no plan still gets a usable sheet
  const empty = await page.evaluate(() => { const s = state; state = migrate({ child: { name: "Sam Lee" }, plan: { accoms: [] }, entries: [], docs: [] }); const d = prepData({ mtype: "IEP meeting", date: daysAhead(5), time: "09:00" }); state = s; return d.Q.map(x => x.t) });
  ok("empty case still gets questions", empty.length === 2 && /IEP goal/.test(empty[0]), empty.join(" | "));

  await page.click("#leaveExample"); await page.waitForTimeout(200);
  ok("leaving the example returns to an empty start", await page.evaluate(() => !state.example && !root.cases.some(c => c.example)) && await page.locator("#welcome").isVisible());
  await page.goto("https://demo.local/?v=2#example"); await page.waitForTimeout(400);
  ok("#example link opens the example family", await page.evaluate(() => state.example === true));
  await page.reload(); await page.waitForTimeout(300);
  ok("example isn't kept after reload", await page.evaluate(() => !state.example));
  ok("no script errors", !errors.length, errors.join("; "));
  await browser.close();
})();
