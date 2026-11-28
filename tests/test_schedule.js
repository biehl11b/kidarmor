// Class schedule: a picture of the schedule is read on the phone and fills in classes and teachers.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const FIX = path.join(__dirname, "fixtures/schedules");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await page.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true; window.__kaSkipIntro = true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const net = []; page.on("request", r => { const u = r.url(); if (!/^https:\/\/(demo\.local|kidarmor\.coastlinecode\.com)\//.test(u) && !/^(data|blob):/.test(u)) net.push(u) });
  await page.route("https://demo.local/**", r => {
    const u = new URL(r.request().url()).pathname;
    if (u.startsWith("/vendor/")) { const f = path.join(__dirname, "..", u); return fs.existsSync(f) ? r.fulfill({ path: f, contentType: f.endsWith(".js") || f.endsWith(".mjs") ? "application/javascript" : "application/octet-stream" }) : r.fulfill({ status: 404, body: "" }) }
    return r.fulfill({ body: page_, contentType: "text/html" })
  });
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  const ok = (name, cond, extra = "") => { console.log((cond ? "  ok   " : "  FAIL ") + name + (extra ? "  → " + extra : "")); if (!cond) process.exitCode = 1 };
  await page.goto("https://demo.local/");
  await page.waitForTimeout(300);
  await page.evaluate(() => { state.child.name = "Ava Biehl"; save(); show("me") });
  await page.waitForTimeout(200);
  ok("schedule panel shows on the Me tab", await page.locator("#schedPanel").isVisible());
  ok("take-a-picture button shows", /Take a picture of the schedule/.test(await page.locator("#schedBody").innerText()));

  async function readPic(file, label) {
    const t0 = Date.now();
    await page.setInputFiles("#schedPhoto", path.join(FIX, file));
    await page.waitForFunction(() => /Found \d+|Couldn't read/.test(document.querySelector("#schedBody").innerText), null, { timeout: 180000 });
    const rows = await page.evaluate(() => schedRead());
    ok(label + ": read in " + Math.round((Date.now() - t0) / 1000) + " s", true);
    return rows
  }
  const find = (R, c, t) => R.find(r => r.cls.toLowerCase().includes(c.toLowerCase()) && (!t || r.teacher === t));

  // 1. a screenshot of a school portal
  let R = await readPic("portal.png", "portal screenshot");
  ok("portal: 7 classes found", R.length === 7, R.map(r => r.cls + "/" + r.teacher + "/" + r.room).join("; "));
  ok("portal: Math with Ravi Patel in C112", !!find(R, "Math 7", "Ravi Patel") && find(R, "Math 7").room === "C112");
  ok("portal: lunch left out", !R.some(r => /lunch/i.test(r.cls)));
  ok("portal: student's own name isn't taken as a teacher", !R.some(r => /Jordan|Miles/.test(r.teacher)));
  await page.screenshot({ path: path.join(__dirname, "schedule-portal.png"), fullPage: true });

  await page.evaluate(() => show("me")); await page.waitForTimeout(200);
  ok("an unsaved list survives the screen redrawing", (await page.evaluate(() => schedRead())).length === 7);
  // fix a row, remove a row, save
  await page.fill('#schedRows [data-sc="room"][data-i="0"]', "B-204");
  await page.click('[data-scdel="6"]');
  await page.click("#schedSave");
  const saved = await page.evaluate(() => state.child.schedule);
  ok("edits and removals are saved", saved.length === 6 && saved[0].room === "B-204", JSON.stringify(saved[0]));
  ok("schedule picture is kept", await page.evaluate(() => !!(state.child.schedPhoto && state.child.schedPhoto.id)));
  ok("schedule picture goes into backups", await page.evaluate(() => caseFiles(state).some(f => f.id === state.child.schedPhoto.id)));

  // 2. a phone photo of a printed schedule (tilted, uneven light)
  R = await readPic("paper-photo.jpg", "paper photo");
  ok("photo: at least 6 classes found", R.length >= 6, R.map(r => r.cls + "/" + r.teacher).join("; "));
  ok("photo: Math with Mr. Cuevas", !!find(R, "Math", "Mr. Cuevas"));
  ok("photo: Science with Ms. Taylor", !!find(R, "Science", "Ms. Taylor"));
  ok("photo: PE with Coach Peterson", !!find(R, "PE", "Coach Peterson"));
  ok("photo: homeroom teacher Mrs. Ladner", R.some(r => r.teacher === "Mrs. Ladner"));
  await page.screenshot({ path: path.join(__dirname, "schedule-photo.png"), fullPage: true });
  await page.click("#schedSave");

  // 3. the class list fills in the forms
  await page.evaluate(() => show("add"));
  await page.selectOption("#kind", "missed"); await page.waitForTimeout(150);
  await page.evaluate(() => { const d = document.querySelector("#fields details.more"); if (d) d.open = true });
  const pick = page.locator('[data-pick="classname"] button', { hasText: "Math" }).first();
  ok("IEP/504 form offers classes from the schedule", await pick.count() > 0);
  await pick.click(); await page.waitForTimeout(150);
  ok("tapping a class fills class and teacher", await page.inputValue("#f-classname") === "Math" && await page.inputValue("#f-staff") === "Mr. Cuevas", await page.inputValue("#f-classname") + " / " + await page.inputValue("#f-staff"));
  const rep = page.locator('[data-pick="reported"] button', { hasText: "Ms. Taylor" }).first();
  ok("who-did-you-tell offers the teachers", await rep.count() > 0);
  await rep.click(); await page.waitForTimeout(150);
  ok("tapping a teacher fills who you told", /^Ms\. Taylor \(.+ teacher\)$/.test(await page.inputValue("#f-reported")), await page.inputValue("#f-reported"));
  ok("a teacher from the schedule counts as classroom level", await page.evaluate(() => whoLevel("Ms. Taylor (Science teacher)")) === 1);
  await page.screenshot({ path: path.join(__dirname, "schedule-form.png"), fullPage: true });
  await page.selectOption("#kind", "comm"); await page.waitForTimeout(150);
  ok("talk-with-teacher form offers the teachers", await page.locator('[data-pick="withwho"] button').count() > 0);

  // 4. a picture with no schedule on it
  await page.evaluate(() => show("me"));
  const blank = path.join(FIX, "..", "blank.png");
  if (!fs.existsSync(blank)) { const p2 = await browser.newPage({ viewport: { width: 600, height: 400 } }); await p2.setContent("<body style='background:#88a'></body>"); await p2.screenshot({ path: blank }); await p2.close() }
  const R4 = await readPic("../blank.png", "blank picture");
  ok("a picture with nothing on it says so kindly", /Couldn't read the classes/.test(await page.locator("#schedBody").innerText()));
  ok("the saved class list is kept after a failed read", R4.length === (await page.evaluate(() => state.child.schedule.length)));

  // 4b. if the reader can't start (a file is missing), parents hear right away instead of waiting
  const bad = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await bad.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true; window.__kaSkipIntro = true });
  await bad.route("https://demo.local/**", r => { const u = new URL(r.request().url()).pathname; if (/eng\.traineddata/.test(u)) return r.fulfill({ status: 404, body: "" }); if (u.startsWith("/vendor/")) return r.fulfill({ path: path.join(__dirname, "..", u), contentType: "application/javascript" }); return r.fulfill({ body: page_, contentType: "text/html" }) });
  await bad.goto("https://demo.local/"); await bad.waitForTimeout(300); await bad.evaluate(() => { state.child.name = "Ava"; save(); show("me") });
  const tb = Date.now(); await bad.setInputFiles("#schedPhoto", path.join(FIX, "portal.png"));
  const quick = await bad.waitForFunction(() => /Couldn't read this picture/.test(document.querySelector("#schedBody").innerText), null, { timeout: 30000 }).then(() => true, () => false);
  ok("a reader problem is reported quickly with a friendly note", quick, Math.round((Date.now() - tb) / 1000) + " s");
  await bad.close();

  // 5. Spanish
  const es = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await es.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true; window.__kaSkipIntro = true; localStorage.setItem("kidarmor.lang", "es") });
  await es.route("https://demo.local/**", r => { const u = new URL(r.request().url()).pathname; if (u.startsWith("/vendor/")) return r.fulfill({ path: path.join(__dirname, "..", u), contentType: "application/javascript" }); return r.fulfill({ body: page_, contentType: "text/html" }) });
  await es.goto("https://demo.local/"); await es.waitForTimeout(300);
  await es.evaluate(() => { state.child.name = "Ava"; save(); show("me") }); await es.waitForTimeout(200);
  await es.setInputFiles("#schedPhoto", path.join(FIX, "portal.png"));
  await es.waitForFunction(() => /Se encontraron \d+ clases/.test(document.querySelector("#schedBody").innerText), null, { timeout: 120000 }).catch(() => {});
  const esText = await es.locator("#schedPanel").innerText();
  ok("Spanish: schedule panel and result are in Spanish", /Horario de clases/.test(esText) && /Se encontraron 7 clases/.test(esText) && /Guardar horario/.test(esText) && !/Take a|Found|Save schedule/.test(esText), esText.slice(0, 160).replace(/\n/g, " | "));
  await es.click("#schedSave"); await es.evaluate(() => show("add")); await es.selectOption("#kind", "comm"); await es.waitForTimeout(200);
  await es.locator('[data-pick="withwho"] button').first().click(); await es.waitForTimeout(150);
  ok("Spanish: picking a teacher writes Spanish wording", /\(maestro de /.test(await es.inputValue("#f-withwho")), await es.inputValue("#f-withwho"));
  await es.close();
  ok("nothing was sent to other websites", !net.length, net.join(" "));
  ok("no page errors", !errors.length, errors.join(" | "));
  await browser.close();
})();
