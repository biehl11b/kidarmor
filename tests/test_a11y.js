// Accessibility checks: every control has a name a screen reader can read, images have text,
// text can be made larger without breaking the layout, and motion stops when the phone asks for less motion.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html lang=en><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;

const AUDIT = () => {
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden]") };
  const name = el => {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    const lb = el.getAttribute("aria-labelledby"); if (lb) return lb.split(" ").map(i => (document.getElementById(i) || {}).textContent || "").join(" ");
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.textContent.trim()) return l.textContent }
    const wrap = el.closest("label"); if (wrap && wrap.textContent.trim()) return wrap.textContent;
    if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit")) return el.value;
    const t = (el.innerText || el.textContent || "").trim(); if (t) return t;
    const img = el.querySelector("img[alt]"); if (img && img.alt) return img.alt;
    return el.getAttribute("title") || (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? el.getAttribute("placeholder") : "") || "";
  };
  const out = [];
  document.querySelectorAll("button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=checkbox]").forEach(el => {
    if (!vis(el)) return; if (!String(name(el)).trim()) out.push("no name: " + el.outerHTML.slice(0, 140));
  });
  document.querySelectorAll("img").forEach(el => { if (vis(el) && !el.hasAttribute("alt")) out.push("img without alt: " + el.outerHTML.slice(0, 100)) });
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1 };
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts }); const page = await ctx.newPage();
    await page.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true });
    await page.route("https://demo.local/**", r => r.fulfill({ body: page_, contentType: "text/html" }));
    await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
    await page.goto("https://demo.local/"); await page.click("#seeExample"); await page.waitForTimeout(300); return page;
  };
  const page = await open();
  const views = ["home", "plan", "reports", "add", "letters", "res", "me"]; const problems = [];
  for (const v of views) { await page.evaluate(v => show(v), v); await page.waitForTimeout(250); (await page.evaluate(AUDIT)).forEach(p => problems.push(v + ": " + p)) }
  await page.evaluate(() => show("home")); await page.click("[data-ump]"); await page.waitForTimeout(200); (await page.evaluate(AUDIT)).forEach(p => problems.push("meeting prep: " + p));
  await page.click("#ppClose");
  ok("every button, link and field has a name screen readers can read", !problems.length, problems.length + "\n      " + problems.slice(0, 25).join("\n      "));
  ok("page has a language set", await page.evaluate(() => !!document.documentElement.lang));

  // larger text: the in-app setting and the phone's own text size
  for (const z of [1.3, 1.6]) {
    await page.evaluate(z => { setTextSize(z) }, z); await page.evaluate(() => show("home")); await page.waitForTimeout(200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`text at ${Math.round(z * 100)}% fits the screen (no sideways scrolling)`, over <= 1, over + "px too wide");
    await page.screenshot({ path: __dirname + `/a11y-text-${Math.round(z * 100)}.png` });
  }
  await page.evaluate(() => setTextSize(1));

  // reduced motion
  const rm = await open({ reducedMotion: "reduce" });
  const moving = await rm.evaluate(() => [...document.querySelectorAll("*")].filter(e => { const s = getComputedStyle(e); return (s.animationName && s.animationName !== "none" && parseFloat(s.animationDuration) > 0.01) || parseFloat(s.transitionDuration) > 0.01 }).length);
  ok("nothing animates when the phone asks for reduced motion", moving === 0, moving + " elements");
  await browser.close();
})();
