// Headless check of the KidArmor demo page: quick, targeted tests of the new features.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const dir = __dirname;
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const pdflib = fs.readFileSync("/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage(); await (typeof page!=="undefined"?page:p).addInitScript(()=>{window.__kaNoMic=true;window.__kaSkipTerms=true;window.__kaSkipWizard=true});
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ body: "", contentType: "text/css" }));
  await page.route("https://demo.local/vendor/**",r=>r.fulfill({path:__dirname+"/../vendor/"+r.request().url().split("/vendor/")[1].split("?")[0],contentType:r.request().url().endsWith(".js")||r.request().url().endsWith(".mjs")?"application/javascript":undefined}));
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/**", (r) => r.fulfill({ body: pdflib, contentType: "application/javascript" }));
  await page.route("https://demo.local/", (r) => r.fulfill({ body: page_, contentType: "text/html" }));
  await page.goto("https://demo.local/");
await page.evaluate(()=>{state=JSON.parse(JSON.stringify(SAMPLE));root.cases=[state];root.active=0;save();show("home")});
  const ok = (name, cond, extra = "") => { console.log((cond ? "  ok   " : "  FAIL ") + name + (extra ? "  → " + extra : "")); if (!cond) process.exitCode = 1; };

  // 1. Sample case loads
  ok("sample case shows", (await page.locator("#timeline details.inc").count()) === 9);

  // 2. Make it factual
  const fx = await page.evaluate(() => makeFactual("I am SO ANGRY!!! That idiot teacher Mr. Grant ALWAYS ignores Jordan's 504 plan. He gave the quiz in the last 10 minutes and my kid couldn't finish!!! How could they let this happen?"));
  ok("factual rewrite", /Mr\. Grant/.test(fx.text) && /504/.test(fx.text) && !/idiot|!!/.test(fx.text) && fx.feelings.length === 2, fx.text);

  // 3. Binder from sample case with a PNG photo + a PDF document attached
  const smallPdf = Buffer.from(await (async () => { const d = await PDFDocument.create(); d.addPage(); d.addPage(); return d.save(); })()).toString("base64");
  const info = await page.evaluate(async (pdfB64) => {
    const c = document.createElement("canvas"); c.width = 300; c.height = 200; const g = c.getContext("2d"); g.fillStyle = "#c33"; g.fillRect(0, 0, 300, 200);
    const png = await new Promise((r) => c.toBlob(r, "image/png"));
    const m1 = await storeUpload(new File([png], "bus-photo.png", { type: "image/png" }));
    const m2 = await storeUpload(new File([b64ToU8(pdfB64)], "504 plan.pdf", { type: "application/pdf" }));
    state.entries[0].files = [m1]; state.docs[0].files = [m2]; save();
    const r = await buildBinder();
    return { bytes: u8ToB64(r.bytes), pages: r.pages, exhibits: r.exhibits, failed: r.failed };
  }, smallPdf);
  const pdf = await PDFDocument.load(Buffer.from(info.bytes, "base64"));
  ok("PDF binder builds", pdf.getPageCount() === info.pages && info.exhibits === 2 && info.failed.length === 0, `${info.pages} pages, ${info.exhibits} exhibits`);
  fs.writeFileSync(path.join(dir, "sample-binder.pdf"), Buffer.from(info.bytes, "base64"));

  // 4. Start own case, add an entry through the real form, add a second child, switch
  await page.evaluate(()=>{startFresh();show("me")});
  await page.fill("#s-child", "Ava Biehl"); await page.fill("#s-school", "Pass Christian Middle"); await page.click("#setupForm button[type=submit]");await page.waitForSelector("#fsDone",{timeout:3000}).then(()=>page.click("#fsDone")).catch(()=>{});
  await page.click('nav.tabs button[data-v="add"]');
  await page.fill("#f-desc", "On Monday, Ava was not given extended time on her math test.");
  await page.click("#saveBtn");
  ok("entry saved in own case", (await page.locator("#timeline details").count()) === 1);
  await page.click('nav.tabs button[data-v="me"]');
  await page.click("#addKid");
  await page.fill("#s-child", "Sam Biehl"); await page.click("#setupForm button[type=submit]");await page.waitForSelector("#fsDone",{timeout:3000}).then(()=>page.click("#fsDone")).catch(()=>{});
  const kids = await page.evaluate(() => root.cases.map((c) => c.child.name));
  ok("two children", kids.length === 2 && kids.includes("Ava Biehl") && kids.includes("Sam Biehl"), kids.join(", "));
  await page.click('nav.tabs button[data-v="home"]');
  ok("switcher visible", await page.isVisible("#kidSwitch"));
  await page.selectOption("#kidSwitch", "0");
  ok("switch shows Ava's entry", (await page.locator("#timeline details").count()) === 1 && /Ava/.test(await page.textContent("#homeTitle")));

  // 5. Backup round trip + wrong passphrase
  const bk = await page.evaluate(async () => {
    const real = root.cases.filter((c) => !c.example && !c.readOnly);
    const text = await sealJson({ data: { cases: real }, files: await packFiles(real.flatMap(caseFiles)) }, "correct horse", "backup", 2000);
    let wrong = "";
    try { await openJson(text, "wrong horse"); } catch (e) { wrong = e.message; }
    const back = await openJson(text, "correct horse");
    return { leaked: text.includes("Ava"), wrong, n: back.value.data.cases.length };
  });
  ok("backup encrypts + restores", !bk.leaked && bk.n === 2 && /doesn't match/.test(bk.wrong), bk.wrong);

  // 6. Advocate share: export Ava's case and import it as read-only
  const sh = await page.evaluate(async () => {
    const copy = JSON.parse(JSON.stringify(state)); copy.readOnly = true; copy.sharedBy = "Joshua";
    const code = shareCode();
    imText = await sealJson({ child: copy, files: await packFiles(caseFiles(state)) }, code, "share", 2000);
    document.querySelector("#imCode").value = code.toLowerCase().replace(/-/g, " ");
    await (document.querySelector("#imGo").onclick)();
    return { n: root.cases.length, ro: state.readOnly, addHidden: document.querySelector("#homeAdd").hidden, banner: document.querySelector("#roBanner").textContent };
  });
  ok("shared case opens read-only", sh.n === 3 && sh.ro && sh.addHidden && /Shared with you by Joshua/.test(sh.banner), sh.banner);

  // 7. PIN lock
  const lk = await page.evaluate(async () => {
    document.querySelector("#pin1").value = "2468"; document.querySelector("#pin2").value = "2468";
    await document.querySelector("#pinSave").onclick();
    showLock(); const shown = !!document.querySelector(".lockscreen");
    document.querySelector("#lockPin").value = "1111"; await document.querySelector("#lockGo").onclick();
    const stillLocked = !!document.querySelector(".lockscreen");
    document.querySelector("#lockPin").value = "2468"; await document.querySelector("#lockGo").onclick();
    return { shown, stillLocked, open: !document.querySelector(".lockscreen") };
  });
  ok("PIN lock", lk.shown && lk.stillLocked && lk.open);

  // 8. Data survives reload (storage), and no page errors
  await page.reload();
  const after = await page.evaluate(() => root.cases.length);
  ok("data survives reload", after === 3);
  await page.evaluate(() => document.querySelector(".lockscreen") && document.querySelector(".lockscreen").remove());
  ok("no script errors", errors.length === 0, errors.join(" | "));

  // screenshots for a visual look
  await page.selectOption("#kidSwitch", "0").catch(() => {});
  console.log("STATE", JSON.stringify(await page.evaluate(() => ({active:root.active,names:root.cases.map(c=>c.child.name+(c.example?"*":"")+(c.readOnly?"(ro)":"")),welcome:!document.querySelector("#welcome").hidden,ro:!document.querySelector("#roBanner").hidden}))));
  await page.waitForTimeout(3000); await page.screenshot({ path: path.join(dir, "shot-home.png"), fullPage: false });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
