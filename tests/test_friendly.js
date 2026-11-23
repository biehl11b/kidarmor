// Easy to use: language and bigger words on the first setup screen, a short Child tab with More settings,
// and plain words instead of jargon on the main screens.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html lang=en><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1 };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("https://demo.local/**", r => r.fulfill({ body: page_, contentType: "text/html" }));
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  await page.goto("https://demo.local/"); await page.waitForTimeout(600);
  ok("after the terms, a short intro explains how it works", await page.locator(".introscreen").isVisible() && /Show me how it works/.test(await page.locator(".introscreen").innerText()));
  await page.click("#inTour"); await page.waitForTimeout(500);
  ok("'Show me how it works' opens the example family with a step-by-step tour", await page.locator("#exampleBar").isVisible() && await page.locator(".tourcard").isVisible() && /Step 1 of 6/i.test(await page.locator(".tourcard").innerText()));
  ok("step 1 points at Log something new", await page.evaluate(() => document.querySelector("#homeAdd").classList.contains("tourhl")));
  const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(await page.evaluate(() => current + ":" + (document.querySelector(".tourhl") || {}).id)); await page.click('.tourcard [data-tour="next"]'); await page.waitForTimeout(350) }
  ok("the tour walks through Get ready, recording, letters, deadlines and sharing", seen.join(",") === "home:homeAdd,home:upcoming,home:homeRecord,letters:l-kind,plan:dlPanel,me:coPanel", seen.join(","));
  ok("the end of the tour offers Set up my child", /Set up my child/.test(await page.locator(".tourcard").innerText()));
  await page.click('.tourcard [data-tour="setup"]'); await page.waitForTimeout(500);
  ok("...which leaves the example and opens setup", await page.locator(".wizard").isVisible() && await page.locator(".tourcard").count() === 0 && await page.evaluate(() => !root.cases.some(c => c.example)));
  const w = await page.locator(".wizard").innerText();
  ok("setup screen 1 asks about language and bigger words first", /Language · Idioma/i.test(w) && /Make the words bigger\?/i.test(w) && w.toLowerCase().indexOf("bigger") < w.toLowerCase().indexOf("your name"));
  ok("language and size are big buttons", (await page.locator(".wizard .bigrow .btn.big").count()) === 5);
  await page.click('.wizard [data-ts="1.4"]'); await page.waitForTimeout(100);
  ok("tapping Bigger makes the words bigger right away", await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ts").trim() === "1.4"));
  ok("Bigger shows as chosen", (await page.getAttribute('.wizard [data-ts="1.4"]', "aria-pressed")) === "true" && (await page.getAttribute('.wizard [data-ts="1"]', "aria-pressed")) === "false");
  await page.click('.wizard [data-lang="en"]'); await page.waitForTimeout(300);
  ok("tapping the language already showing doesn't restart setup", await page.locator(".wizard").isVisible() && await page.evaluate(() => localStorage.getItem("kidarmor.lang") === "en"));
  await page.reload(); await page.waitForTimeout(500);
  ok("the bigger size is remembered", await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ts").trim() === "1.4"));
  await page.evaluate(() => { document.querySelectorAll(".wizard").forEach(x => x.remove()); setTextSize(1); openExample(); show("me") }); await page.waitForTimeout(300);
  const order = await page.evaluate(() => [...document.querySelectorAll("#v-me > *")].filter(e => !e.hidden && e.offsetHeight).map(e => e.id || e.className || e.tagName));
  ok("Child tab: child info, Share, Help, then More settings", order.indexOf("setupForm") < order.indexOf("coPanel") && order.indexOf("coPanel") < order.indexOf("helpPanel") && order.indexOf("helpPanel") < order.indexOf("moreBtn"), order.join(" > "));
  ok("advanced settings start hidden", await page.locator("#moreSettings").isHidden() && await page.locator("#backupPanel").isHidden() && await page.locator("#lockPanel").isHidden());
  await page.click("#moreBtn"); await page.waitForTimeout(150);
  ok("More settings opens them", await page.locator("#textPanel").isVisible() && await page.locator("#backupPanel").isVisible() && await page.locator("#moreBtn").isHidden());
  await page.evaluate(() => show("home")); await page.evaluate(() => show("me")); await page.waitForTimeout(150);
  ok("they're tucked away again next time", await page.locator("#moreSettings").isHidden());
  await page.click("#lockPill"); await page.waitForTimeout(300);
  ok("'Only on this phone' still opens the privacy section", await page.locator("#privacyPanel").isVisible());
  // plain words on the main screens
  const jargon = [];
  for (const v of ["home", "plan", "reports", "add", "letters", "res", "me"]) {
    await page.evaluate(v => { show(v); openMore() }, v); await page.waitForTimeout(150);
    const t = await page.evaluate(() => [...document.querySelectorAll("main .view:not([hidden])")].map(e => e.innerText).join(" "));
    for (const wd of ["binder", "encrypted backup", "passphrase", "pairing code"]) if (new RegExp(wd, "i").test(t)) jargon.push(v + ": " + wd);
  }
  ok("no jargon on the main screens (binder, encrypted backup, passphrase, pairing code)", !jargon.length, jargon.join(", "));
  // a phone browser filling the search box with a saved email mustn't hide the case
  await page.evaluate(() => leaveExample()); await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelectorAll(".wizard").forEach(x => x.remove()); const c = migrate({ child: { name: "Libby Test", school: "Hancock" }, plan: { accoms: [] }, entries: [], docs: [] }); root.cases = [c]; root.active = 0; state = c; save(); show("home"); const q = document.querySelector("#search"); q.value = "info@coastlinecode.com"; q.dispatchEvent(new Event("input")); q.blur() });
  await page.evaluate(() => clearAutofill()); await page.waitForTimeout(200);
  ok("a search box filled in by the browser is cleared", await page.evaluate(() => document.querySelector("#search").value === "" && query === ""));
  ok("search box asks browsers not to fill it", (await page.getAttribute("#search", "autocomplete")) === "off");
  ok("a new case shows 'New here?' right under Log something new", await page.locator("#startCard").isVisible() && await page.evaluate(() => { const a = document.querySelector("#homeAdd").getBoundingClientRect(), c = document.querySelector("#startCard").getBoundingClientRect(); return c.top > a.top && c.top < a.bottom + 40 }));
  await page.click('[data-start="prep"]'); await page.waitForTimeout(400);
  ok("'Get ready for a meeting' asks for the meeting first when none is scheduled", await page.evaluate(() => !!document.querySelector(".sheet")));
  await page.evaluate(() => { closeSheet(); state.upcoming = [{ id: "m9", title: "Annual IEP meeting", mtype: "IEP meeting", date: "2026-12-10", time: "10:00", minutes: 60 }]; save(); show("plan") }); await page.waitForTimeout(300);
  ok("Plan tab shows the meeting with a Get ready button", await page.locator('#prepPanel [data-prep="m9"]').isVisible());
  await page.click('#prepPanel [data-prep="m9"]'); await page.waitForTimeout(400);
  ok("...which opens the meeting plan", await page.evaluate(() => /meeting plan|Meeting plan|Questions/i.test(document.querySelector(".sheet")?.innerText || "")));
  await page.evaluate(() => { closeSheet(); state.upcoming = []; save(); show("plan") }); await page.waitForTimeout(200);
  ok("Plan tab explains deadlines even before any are started", await page.locator("#dlPanel").isVisible() && await page.locator('[data-goletter="records"]').isVisible());
  await page.click('[data-goletter="records"]'); await page.waitForTimeout(300);
  ok("'Ask for school records' opens that letter", await page.evaluate(() => current === "letters" && document.querySelector("#l-kind").value === "records"));
  await page.evaluate(() => show("home")); await page.waitForTimeout(200);
  await page.click('[data-start="share"]'); await page.waitForTimeout(400);
  ok("'Share with the other parent' goes to the sharing section", await page.evaluate(() => current === "me") && await page.locator("#coPanel").isVisible());
  ok("the 'New here?' box has the real first steps, not the example", (await page.locator("#startCard [data-start]").count()) === 3);
  await page.evaluate(() => { show("me"); openMore() }); await page.waitForTimeout(200);
  await page.click("#hfTour"); await page.waitForTimeout(500);
  ok("Child tab > Help can show the tour again", await page.locator(".tourcard").isVisible() && await page.locator("#exampleBar").isVisible());
  await page.click('.tourcard [data-tour="skip"]'); await page.waitForTimeout(400);
  ok("skipping the tour goes back to my own case", await page.evaluate(() => !state.example && state.child.name === "Libby Test") && await page.locator(".tourcard").count() === 0);
  ok("no script errors", !errors.length, errors.join("; "));
  await browser.close();
})();
