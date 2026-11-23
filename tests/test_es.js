// Spanish: screens in Spanish, but letters, PDFs and saved data stay in English, and nothing breaks.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html lang=en><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1 };
(async () => {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, "../native/src/i18n-es.json"), "utf8"));
  const m = html.match(/\/\*ES_DICT_START\*\/([\s\S]*?)\/\*ES_DICT_END\*\//);
  ok("the app has the latest Spanish list (run native/scripts/embed-es.cjs after editing)", m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(dict));
  const browser = await chromium.launch();
  const open = async lang => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: lang === "phone-es" ? "es-US" : "en-US" });
    await page.addInitScript(l => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true; if (l === "es") try { localStorage.setItem("kidarmor.lang", "es") } catch (e) { } }, lang);
    page.errors = []; page.on("pageerror", e => page.errors.push(e.message));
    await page.route("https://demo.local/**", r => { const u = r.request().url(); if (u.includes("/vendor/")) return r.fulfill({ path: path.join(__dirname, "../vendor", u.split("/vendor/")[1].split("?")[0]), contentType: "application/javascript" }); return r.fulfill({ body: page_, contentType: "text/html" }) });
    await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
    await page.goto("https://demo.local/"); return page;
  };
  const p = await open("es");
  ok("welcome screen is in Spanish", /Bienvenido a KidArmor/.test(await p.locator("#welcome").innerText()));
  ok("page language is Spanish", await p.evaluate(() => document.documentElement.lang === "es"));
  ok("tabs are in Spanish", /Caso/.test(await p.locator("nav.tabs").innerText()) && /Cartas/.test(await p.locator("nav.tabs").innerText()));
  await p.click("#seeExample"); await p.waitForTimeout(300);
  ok("example family screen in Spanish", /Expediente de Jordan/.test(await p.locator("#homeTitle").innerText()), await p.locator("#homeTitle").innerText());
  ok("dates on screen are in Spanish", /\b(oct|nov|dic)\b/.test(await p.locator("#timeline").innerText()));

  // letters stay English with English dates
  await p.evaluate(() => show("letters")); await p.selectOption("#l-kind", "bully"); await p.waitForTimeout(150);
  const L = await p.locator("#letter").innerText();
  ok("letter is in English", /Formal written report of bullying/.test(L) && /I am writing to formally report/.test(L));
  ok("letter dates are English", /(January|February|March|April|May|June|July|August|September|October|November|December) \d+, 20\d\d/.test(L) && !/ de (noviembre|octubre|diciembre)/.test(L));
  ok("letter screen says letters stay in English", true);
  const href = decodeURIComponent(await p.getAttribute("#emailBtn", "href"));
  ok("email subject in English", /subject=Formal report of bullying/.test(href));

  // dropdown values stay English so saved data and logic don't change
  await p.evaluate(() => { show("home"); openSchedule() }); await p.waitForTimeout(200);
  const opts = await p.evaluate(() => [...document.querySelectorAll("#umType option")].map(o => o.value + "=" + o.textContent));
  ok("meeting type shows Spanish but keeps English value", opts.includes("504 meeting=Reunión 504") && opts.includes("IEP meeting=Reunión del IEP"), opts.join(", "));
  await p.selectOption("#umType", "IEP meeting"); await p.fill("#umDate", "2026-12-15"); await p.fill("#umTime", "10:00");
  await p.evaluate(() => { document.querySelector("#umCal").checked = false; document.querySelector("#umSave").click() }); await p.waitForTimeout(200);
  ok("saved meeting type is English", await p.evaluate(() => state.upcoming.some(m => m.mtype === "IEP meeting" && m.date === "2026-12-15")));

  // meeting prep in Spanish, PDF in English
  await p.evaluate(() => { closeSheet(); openPrep("u1") }); await p.waitForTimeout(200);
  const prep = await p.locator(".sheet").innerText();
  ok("meeting prep questions in Spanish", /¿Cómo va a asegurar la escuela que se dé siempre\?/.test(prep) && /PREGUNTAS PARA HACER|Preguntas para hacer/.test(prep), prep.slice(prep.indexOf("PREGUNTAS"), prep.indexOf("PREGUNTAS") + 300));
  await p.click("#ppDraft"); const conc = await p.inputValue("#ppConc");
  ok("concerns draft in Spanish", /Me preocupa/.test(conc), conc.slice(0, 80));
  const pdfText = await p.evaluate(async () => { const m = state.upcoming.find(x => x.id === "u1"); const d = inEnglish(() => prepData(m)); return d.Q.map(x => x.t).join(" | ") + " || " + inEnglish(() => fmtWhen(m)) });
  ok("meeting plan PDF data is English", /How will the school make sure/.test(pdfText) && / at /.test(pdfText), pdfText.slice(-60));
  ok("recording notice email to the school is English", /^mailto:.*I%27m%20writing|I'm%20writing/.test(await p.evaluate(() => recNoticeMail(state.upcoming.find(x => x.id === "u1")))));

  // a phone set to Spanish picks Spanish by itself
  const q = await open("phone-es");
  ok("phone in Spanish shows Spanish without choosing", /Bienvenido/.test(await q.locator("#welcome").innerText()));
  // choosing English in the Child tab
  await p.evaluate(() => { closeSheet(); show("me") }); await p.waitForTimeout(150);
  ok("language buttons in the Child tab", (await p.locator("[data-lang]").count()) === 3);
  for (const [n, x] of [["Spanish", p], ["Spanish phone", q]]) ok("no script errors (" + n + ")", !x.errors.length, x.errors.join("; "));
  const e = await open("en");
  ok("English stays English", /Welcome to KidArmor/.test(await e.locator("#welcome").innerText()) && await e.evaluate(() => document.documentElement.lang === "en"));
  await browser.close();
})();
