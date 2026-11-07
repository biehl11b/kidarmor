// Security regression tests: crafted links/files can't inject HTML, gain write access, or hang the app.
const { chromium } = require("playwright"); const fs = require("fs"); const zlib = require("zlib"); const { webcrypto: crypto } = require("crypto");
const html = fs.readFileSync(__dirname + "/../native/src/app.html", "utf8");
const page_ = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>' + html + "</body></html>";
const ok = (n, c, x = "") => { console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  → " + x : "")); if (!c) process.exitCode = 1 };
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function seal(obj, code) {
  const z = zlib.deflateRawSync(Buffer.from(JSON.stringify(obj)));
  const salt = crypto.getRandomValues(new Uint8Array(16)), nonce = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", Buffer.from(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, z));
  const out = new Uint8Array(29 + ct.length); out[0] = 2; out.set(salt, 1); out.set(nonce, 17); out.set(ct, 29); return b64u(out);
}
const bad = `<meta http-equiv=refresh content='0;url=https://evil.example/'><i id=PWN>x</i>`;
(async () => {
  const evil = { child: { name: "Evil" }, readOnly: false, invites: [{ id: "k1", key: "AAAA" }], updKey: "x", upcoming: [{ id: "u1", title: "Fake reminder", date: "2030-01-01", time: "10:00", rem1: 60 }],
    plan: { accoms: [] }, docs: [{ id: "d1", onPhone: bad, files: [] }], reports: [], health: [],
    entries: [{ id: "e1", kind: "incident", date: "2026-10-01", desc: "hi", files: [], onPhone: { files: bad, recs: bad } }] };
  const link = await seal(evil, "ABCDEFGHJK");
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = [], nav = []; p.on("pageerror", e => errs.push(e.message));
  p.on("request", r => { if (/evil\.example/.test(r.url())) nav.push(r.url()) });
  await p.addInitScript(() => { window.__kaSkipTerms = true; window.__kaSkipWizard = true });
  await p.route("https://kidarmor.example/**", r => r.fulfill({ body: page_, contentType: "text/html" }));
  await p.goto("https://kidarmor.example/#open=" + link); await p.waitForSelector("#olCode");
  await p.fill("#olCode", "ABCDE-FGHJK"); await p.click("#olGo"); await p.waitForSelector("#olCode", { state: "detached" }); await p.waitForTimeout(800);
  await p.evaluate(() => { document.querySelectorAll("#timeline details").forEach(d => d.open = true) }); await p.waitForTimeout(300);
  ok("crafted link can't inject HTML", !(await p.$("#PWN")) && !nav.length, nav.join(" "));
  const c = await p.evaluate(() => ({ ro: state.readOnly, inv: state.invites, up: state.upcoming, uk: state.updKey, op: state.entries[0].onPhone, dop: state.docs[0].onPhone }));
  ok("opened case is read-only with no invites, keys or reminders", c.ro === true && !c.inv && !c.up && !c.uk, JSON.stringify(c));
  ok("on-phone counts are plain numbers", typeof c.op.files === "number" && typeof c.op.recs === "number" && typeof c.dop === "number", JSON.stringify([c.op, c.dop]));
  const hang = await p.evaluate(async () => { const t = Date.now(); try { await openJson(JSON.stringify({ format: "kidarmor", type: "share", data: "AA", kdf: { salt: "AAAAAAAAAAAAAAAAAAAAAA==", iter: 2000000000 }, cipher: { nonce: "AAAAAAAAAAAAAAAA" } }), "x") } catch (e) { return { ms: Date.now() - t, msg: e.message } } return { ms: Date.now() - t } });
  ok("file asking for a huge number of rounds is refused at once", hang.ms < 1000 && /isn't a KidArmor/.test(hang.msg || ""), JSON.stringify(hang));
  const codes = await p.evaluate(() => Array.from({ length: 200 }, () => linkCode()));
  ok("link codes are 12 characters, unambiguous letters and digits", codes.every(c => /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(c)) && new Set(codes).size === 200, codes[0]);
  // lock screen hides the records from screen readers
  await p.evaluate(() => { localStorage.setItem("kidarmor.pin", JSON.stringify({ s: "AAAAAAAAAAAAAAAAAAAAAA==", h: "x", i: 1000 })); showLock() });
  await p.waitForTimeout(200);
  const snap = JSON.stringify(await p.accessibility.snapshot({ interestingOnly: true }));
  ok("records behind the lock screen are hidden from screen readers", /locked/i.test(snap) && !/Evil/.test(snap));
  await p.evaluate(async () => { document.querySelector(".lockscreen")?.remove(); document.querySelectorAll("body>*").forEach(x => x.inert = false); const h = await pinHash("2468"); localStorage.setItem("kidarmor.pin", JSON.stringify({ s: h.s, h: h.h, i: 600000 })); showLock() });
  await p.fill("#lockPin", "2468"); await p.click("#lockGo"); await p.waitForSelector(".lockscreen", { state: "detached", timeout: 8000 });
  ok("the right PIN unlocks and the app works again", await p.evaluate(() => [...document.body.children].every(x => !x.inert)) && await p.isEnabled("nav.tabs button[data-v=me]"));
  ok("no script errors", !errs.length, errs.join(" | "));
  await b.close()
})().catch(e => { console.log("  FAIL", e.message); process.exit(1) });
