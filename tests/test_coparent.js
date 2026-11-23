// Co-parent sharing between two phones: pair with a code (or the QR link), send the case as a locked file,
// both parents add, edit and delete, and each side merges the other's changes. Photos travel too.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html lang=en><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1 };

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  await page.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true });
  page.errors = []; page.on("pageerror", e => page.errors.push(e.message));
  await page.route("https://demo.local/**", r => { const u = r.request().url(); if (u.includes("/vendor/")) return r.fulfill({ path: path.join(__dirname, "../vendor", u.split("/vendor/")[1].split("?")[0]), contentType: "application/javascript" }); return r.fulfill({ body: page_, contentType: "text/html" }) });
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  await page.goto("https://demo.local/");
  await page.evaluate(n => { root.profile = { name: n + " Lee", email: n.toLowerCase() + "@example.com", phone: "555", state: "MS" }; window.__files = []; window.saveFile = async (fn, data) => { window.__files.push({ fn, data }); return true } }, name);
  return page;
}
const lastFile = p => p.evaluate(() => window.__files[window.__files.length - 1]);
const give = (p, f) => p.evaluate(async t => { await coReceive(t) }, f.data);

(async () => {
  const browser = await chromium.launch();
  const A = await phone(browser, "Pat"), B = await phone(browser, "Jamie");
  // Pat's case with an entry that has a photo
  await A.evaluate(async () => {
    const c = migrate({ child: { name: "Sam Lee", grade: "4", school: "Bay Elementary", parent: "Pat Lee", myemail: "pat@example.com", contact: "555-1111" }, plan: { type: "504 plan", accoms: [{ id: "a1", text: "Extra time" }] }, entries: [], docs: [] });
    root.cases = [c]; root.active = 0; state = c;
    await putFile({ id: "fphoto1", name: "note.jpg", type: "image/jpeg", blob: new Blob([new Uint8Array([255, 216, 255, 1, 2, 3])], { type: "image/jpeg" }) });
    state.entries.push({ id: "e1", kind: "incident", date: "2026-11-01", desc: "Pushed at recess", sev: "med", files: [{ id: "fphoto1", name: "note.jpg", type: "image/jpeg" }] });
    state.entries.push({ id: "e2", kind: "comm", date: "2026-11-03", method: "Email", withwho: "Ms. Ray", desc: "Asked about recess", files: [] });
    state.entries.push({ id: "e3", parentNote: "private note", kind: "missed", date: "2026-11-05", vtype: ACC, accom: "a1", desc: "No extra time", files: [] });
    save(); show("me")
  });
  ok("Child tab offers sharing with the other parent", await A.locator("#coPair").isVisible());
  await A.click("#coPair"); await A.waitForTimeout(500);
  ok("pairing screen shows a QR code", (await A.locator("#coQr svg").count()) === 1);
  const code = await A.evaluate(() => state.co.code);
  ok("pairing code is 12 characters", /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
  await A.click("#coSendNow"); await A.waitForTimeout(1500);
  const f1 = await lastFile(A);
  ok("Send my latest makes a locked file", f1 && /"type":"coparent"/.test(f1.data) && !/Pushed at recess/.test(f1.data) && !/pat@example/.test(f1.data), f1 && f1.fn);

  // Jamie pairs by the QR link (what the camera opens), then opens the file
  await B.evaluate(c => { location.hash = "#pair=" + c.replace(/-/g, "") + ".Pat" }, code); await B.waitForTimeout(300);
  ok("QR link opens the join screen with the code filled in", (await B.inputValue("#cjCode")).replace(/-/g, "") === code.replace(/-/g, ""));
  await B.click("#cjGo"); await B.waitForTimeout(200); await B.click("#cjDone");
  await give(B, f1); await B.waitForTimeout(300);
  let b = await B.evaluate(() => ({ name: state.child.name, n: state.entries.length, co: state.co && state.co.with, parent: state.child.parent, email: state.child.myemail, note: state.entries.some(e => e.parentNote), ro: !!state.readOnly }));
  ok("Jamie gets Sam's case, editable, linked to Pat", b.name === "Sam Lee" && b.n === 3 && b.co === "Pat" && !b.ro, JSON.stringify(b));
  ok("Jamie's own name and email are used, not Pat's", b.parent === "Jamie Lee" && b.email === "jamie@example.com");
  ok("Pat's private notes didn't travel", !b.note);
  ok("the photo came across", await B.evaluate(async () => { const r = await getFile("fphoto1"); return !!(r && r.blob && r.blob.size === 6) }));

  // both change things
  await B.evaluate(() => { state.entries.push({ id: "e4", kind: "comm", date: "2026-11-10", method: "Phone call", withwho: "Principal", desc: "Jamie called the principal", files: [] }); state.entries = state.entries.filter(e => e.id !== "e2"); save() });
  await B.waitForTimeout(20);
  await A.evaluate(() => { state.entries.push({ id: "e5", kind: "incident", date: "2026-11-11", desc: "Lunch problem", sev: "low", files: [] }); save() });
  await A.waitForTimeout(30);
  await B.evaluate(() => { const e = state.entries.find(x => x.id === "e1"); e.desc = "Pushed at recess, scraped knee (Jamie added)"; save() });
  await B.evaluate(() => coSend()); await B.waitForTimeout(1500);
  await give(A, await lastFile(B)); await A.waitForTimeout(300);
  let a = await A.evaluate(() => state.entries.map(e => e.id + ":" + e.desc).sort());
  ok("Pat gets Jamie's new entry", a.some(x => x.startsWith("e4:")), a.join(" | "));
  ok("Jamie's deletion reaches Pat", !a.some(x => x.startsWith("e2:")));
  ok("Pat keeps his own new entry", a.some(x => x.startsWith("e5:")));
  ok("the newer edit wins", a.some(x => x === "e1:Pushed at recess, scraped knee (Jamie added)"));
  ok("Pat keeps his private note", await A.evaluate(() => state.entries.find(e => e.id === "e3").parentNote === "private note"));
  ok("Pat's contact info unchanged", await A.evaluate(() => state.child.parent === "Pat Lee" && state.child.myemail === "pat@example.com"));
  await A.evaluate(() => coSend()); await A.waitForTimeout(1500); await give(B, await lastFile(A)); await B.waitForTimeout(300);
  b = await B.evaluate(() => state.entries.map(e => e.id).sort().join(","));
  ok("after sending back, both phones match", b === "e1,e3,e4,e5", b);
  await give(B, await lastFile(A)); await B.waitForTimeout(200);
  ok("opening the same file twice changes nothing", (await B.evaluate(() => state.entries.length)) === 4);

  // a stranger's file can't be opened
  const C = await phone(browser, "Kim");
  await C.evaluate(() => { const c = migrate({ child: { name: "Other" }, plan: { accoms: [] }, entries: [], docs: [] }); root.cases = [c]; root.active = 0; state = c; save() });
  await give(C, await lastFile(A)); await C.waitForTimeout(200);
  ok("a phone that isn't paired can't open the file", (await C.evaluate(() => root.cases.length === 1 && state.child.name === "Other")));
  ok("wrong code is refused when typed", await C.evaluate(() => { coJoin("ABCD", ""); document.querySelector("#cjGo").click(); const t = document.querySelector("#cjErr").textContent; closeSheet(); return /12 letters/.test(t) }));
  // professional share links don't carry the pairing code
  ok("professional share never includes the pairing code", await A.evaluate(() => { const c = caseForPro(state, ["incident", "missed", "comm", "meeting", "plan"], false); return !c.co && !JSON.stringify(c).includes(state.co.code) }));
  ok("stop sharing keeps the case", await A.evaluate(async () => { show("me"); document.querySelector("#coStop").click(); document.querySelector("#coStop").click(); return !state.co && state.entries.length === 4 }));
  for (const [n, p] of [["Pat", A], ["Jamie", B], ["Kim", C]]) ok(`no script errors (${n})`, !p.errors.length, p.errors.join("; "));
  await browser.close();
})();
