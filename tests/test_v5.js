// Quick checks for: save an email, meeting recording + transcript, CC/BCC, opening phone-app files, binder transcript.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const dir = __dirname;
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const pdflib = fs.readFileSync("/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 400, height: 860 } }); const page = await ctx.newPage(); await (typeof page!=="undefined"?page:p).addInitScript(()=>{window.__kaNoMic=true;window.__kaSkipTerms=true;window.__kaSkipWizard=true});
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ body: "", contentType: "text/css" }));
  await page.route("https://demo.local/vendor/**",r=>r.fulfill({path:__dirname+"/../vendor/"+r.request().url().split("/vendor/")[1].split("?")[0],contentType:r.request().url().endsWith(".js")||r.request().url().endsWith(".mjs")?"application/javascript":undefined}));
  await page.route("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/**", (r) => r.fulfill({ body: pdflib, contentType: "application/javascript" }));
  await page.route("https://demo.local/", (r) => r.fulfill({ body: `<!doctype html><html><body>${html}</body></html>`, contentType: "text/html" }));
  await page.goto("https://demo.local/");
await page.evaluate(()=>{state=JSON.parse(JSON.stringify(SAMPLE));root.cases=[state];root.active=0;save();show("home")});
  const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1; };

  // sample meeting shows a transcript
  await page.evaluate(()=>{filter="meeting";renderHome();document.querySelector("#timeline details").open=true});
  ok("sample meeting transcript visible", await page.isVisible("#timeline details[open] details.txtab"));

  // binder includes the transcript
  const pdfB64 = await page.evaluate(async () => u8ToB64((await buildBinder()).bytes));
  fs.writeFileSync(path.join(dir, "v5-binder.pdf"), Buffer.from(pdfB64, "base64"));
  const txt = execSync(`pdftotext ${path.join(dir, "v5-binder.pdf")} -`).toString();
  ok("binder has transcript appendix", /Transcript: Parent-teacher conference/.test(txt) && /announced to everyone/.test(txt));

  // testers can try things in the sample case without losing it
  await page.click('nav.tabs button[data-v="home"]');
  await page.click("#homeEmailSave"); await page.evaluate(()=>{const t=document.querySelector("#emText");t.value=SAMPLE_EMAIL;emReadText(SAMPLE_EMAIL)});
  ok("sample email fills in", (await page.inputValue("#emWho")) === "Tom Daniels" && /504 plan/.test(await page.inputValue("#emSubj")));
  await page.click("#emSave");
  await page.waitForFunction(() => state.entries.length === 10);
  ok("sample case kept after trying an email", await page.evaluate(() => state.example && state.entries.length === 10));
  await page.click('nav.tabs button[data-v="res"]');
  const resCount = await page.locator("#v-res .res").count();
  const links = await page.$$eval("#v-res a.rlink", (a) => a.map((x) => x.href));
  ok("resources tab lists groups with links", resCount >= 11 && links.every((h) => h.startsWith("https://")), resCount + " groups, " + links.length + " links");
  await page.screenshot({ path: path.join(dir, "v6-res.png") });

  // start own case; parent email set so "sent by me" is detected
  await page.click('nav.tabs button[data-v="home"]');
  await page.evaluate(()=>{startFresh();show("me")});
  await page.fill("#s-child", "Ava Biehl"); await page.fill("#s-myemail", "parent@example.com"); await page.click("#setupForm button[type=submit]");await page.waitForSelector("#fsDone",{timeout:3000}).then(()=>page.click("#fsDone")).catch(()=>{});
  await page.click('nav.tabs button[data-v="home"]');

  // save an email by pasting (Outlook style)
  await page.click("#homeEmailSave");
  await page.fill("#emText", "From: Lee, Dana <dlee@harborms.org>\nSent: Thursday, October 15, 2026 2:41 PM\nTo: Parent <parent@example.com>\nSubject: Cafeteria incident\n\nWe are looking into what happened today.");
  await page.click("#emRead");
  ok("email read", (await page.inputValue("#emWho")) === "Lee, Dana" && (await page.inputValue("#emDate")) === "2026-10-15" && (await page.inputValue("#emSubj")) === "Cafeteria incident" && (await page.inputValue("#emDir")) === "in");
  await page.click("#emSave");
  const e1 = await page.evaluate(() => state.entries.find((e) => e.subject === "Cafeteria incident"));
  ok("email saved as a contact", e1 && e1.method === "Email" && e1.direction === "The school contacted me" && /looking into/.test(e1.desc));
  ok("title shows subject", /Email with Lee, Dana: Cafeteria incident/.test(await page.textContent("#timeline")));

  // save an .eml file the parent sent, with an attachment
  const eml = ["Return-Path: <parent@example.com>", "From: Parent <parent@example.com>", "To: Tom Daniels <tdaniels@harborms.org>", "Subject: Follow up on 504", "Date: Fri, 16 Oct 2026 08:10:00 -0500", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="B"', "", "--B", "Content-Type: text/plain", "", "Any update on the retake?", "--B", 'Content-Type: image/png; name="note.png"', 'Content-Disposition: attachment; filename="note.png"', "Content-Transfer-Encoding: base64", "", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "--B--"].join("\r\n");
  await page.click("#homeEmailSave");
  await page.setInputFiles("#emFile", { name: "followup.eml", mimeType: "message/rfc822", buffer: Buffer.from(eml) });
  await page.waitForSelector("#emSave");
  ok("eml: sent by parent detected", (await page.inputValue("#emDir")) === "out" && (await page.inputValue("#emWho")) === "Tom Daniels");
  await page.click("#emSave");
  await page.waitForFunction(() => state.entries.some((e) => e.subject === "Follow up on 504"), null, { timeout: 5000 });
  const e2 = await page.evaluate(() => state.entries.find((e) => e.subject === "Follow up on 504"));
  ok("eml saved with its attachment", e2 && e2.files.length === 1 && e2.direction === "I contacted the school");

  // meeting with an uploaded recording
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.from([16,0,0,0,1,0,1,0,0x40,0x1f,0,0,0x80,0x3e,0,0,2,0,16,0]), Buffer.from("data"), Buffer.alloc(4)]);
  await page.click("#homeRecord");
  ok("no mic: no Voice Memos steps, can add a recording", !/Voice Memos/.test(await page.textContent(".sheet")) && await page.locator("#rcPick").count()===1);
  await page.setInputFiles("#rcPick", { name: "meeting.wav", mimeType: "audio/wav", buffer: wav });
  await page.waitForFunction(() => (vals.recordings || []).length === 1 && !document.querySelector("#v-add").hidden);
  ok("recording opens a new meeting entry", (await page.inputValue("#kind")) === "meeting" && /Recorded meeting/.test(await page.inputValue("#f-desc")));
  await page.click("#saveBtn");
  const m = await page.evaluate(() => state.entries.find((e) => e.kind === "meeting"));
  ok("meeting saved with recording", m && m.recordings.length === 1);
  const pdf2 = await page.evaluate(async () => { const r = await buildBinder(); return r.failed.length; });
  ok("audio isn't treated as a PDF exhibit", pdf2 === 0);

  // CC / BCC
  await page.evaluate(() => { state.child.to = "Dr. Pruitt"; state.child.toemail = "kpruitt@x.org"; state.plan.cmemail = "tdaniels@x.org"; save(); });
  await page.click('nav.tabs button[data-v="letters"]');
  await page.selectOption("#l-kind", "accom");
  const href = await page.getAttribute("#emailBtn", "href");
  ok("cc case manager + bcc parent", /^mailto:kpruitt%40x\.org\?cc=tdaniels%40x\.org&bcc=parent%40example\.com&subject=/.test(href), href.slice(0, 90));

  // open a share file made by the PHONE APP (its format)
  const opened = await page.evaluate(async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const child = { id: "c9", name: "Sam Miles", grade: "5", school: "Harbor Elementary", principal: "Ms. Ray", principalTitle: "Principal", principalEmail: "ray@x.org", readOnly: true, sharedBy: "Alex", sharedAt: new Date().toISOString(),
      plan: { type: "IEP", cm: "Ms. Fox", cmEmail: "fox@x.org", accoms: [{ id: "a1", text: "Speech therapy 30 min/week" }] }, docs: [],
      entries: [{ id: "e1", kind: "meeting", date: "2026-10-10", desc: "IEP meeting", mtype: "IEP meeting", transcript: "[00:01] hello", files: [{ id: "x1", name: "sign-in.png", mime: "image/png", file: "x1.png" }], recordings: [{ id: "r1", name: "rec.m4a", mime: "audio/mp4", file: "r1.m4a" }], createdAt: "", updatedAt: "" }] };
    const code = shareCode();
    imText = await sealJson({ child, files: { "x1.png": png, "r1.m4a": png } }, code, "share", 2000);
    document.querySelector("#imCode").value = code;
    await document.querySelector("#imGo").onclick();
    const e = state.entries[0];
    const rec = await getFile(e.files[0].id);
    return { name: state.child.name, ro: state.readOnly, to: state.child.to, cm: state.plan.cmemail, files: e.files.length, recs: (e.recordings || []).length, stored: !!rec };
  });
  ok("phone-app share opens on a computer", opened.name === "Sam Miles" && opened.ro && opened.to === "Ms. Ray" && opened.cm === "fox@x.org" && opened.files === 1 && opened.recs === 1 && opened.stored, JSON.stringify(opened));

  ok("no script errors", errors.length === 0, errors.join(" | "));
  await page.click('nav.tabs button[data-v="home"]'); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, "v5-home.png") });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
