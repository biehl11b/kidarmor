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
  ok("setup opens on its own", await page.locator(".wizard").isVisible());
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
  ok("no script errors", !errors.length, errors.join("; "));
  await browser.close();
})();
