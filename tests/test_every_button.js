// Clicks every button on every screen (and every button in the sheet it opens) with a realistic case.
// Reports script errors, buttons that do nothing, and sheets with no way to close.
const { chromium } = require("playwright"); const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../native/src/app.html", "utf8");
const page_ = '<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>' + html + "</body></html>";
const SKIP = /erase everything|tap again|sign out|delete|remove|wipe/i; // destructive: covered by their own tests
const VIEWS = ["home", "add", "reports", "plan", "letters", "res", "me"];
(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone", "clipboard-read", "clipboard-write"], acceptDownloads: true });
  await ctx.route("https://kidarmor.example/**", r => { const u = r.request().url(); if (u.split("#")[0].endsWith("/")) return r.fulfill({ body: page_, contentType: "text/html" }); const m = u.match(/vendor\/([\w.-]+)$/); if (m && fs.existsSync(__dirname+"/../vendor/" + m[1])) return r.fulfill({ body: fs.readFileSync(__dirname+"/../vendor/" + m[1]), contentType: "application/javascript" }); return r.fulfill({ status: 404, body: "" }) });
  await ctx.route("https://kidarmor.coastlinecode.com/**", r => r.fulfill({ status: 404, body: "" }));
  await ctx.addInitScript(() => { window.__kaSkipTerms = true; window.__kaSkipWizard = true; try { localStorage.setItem("kidarmor.stt", "service") } catch (e) { } });
  // build a realistic case once
  const s = await ctx.newPage(); await s.goto("https://kidarmor.example/");
  await s.evaluate(() => {
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) };
    Object.assign(state.child, { name: "Ava Test", parent: "Pat Test", school: "Pass Christian Elementary", grade: "4", teacher: "Mr. Lee", principal: "Ms. Ross" });
    state.plan = { type: "IEP", accoms: ["Extra time on tests", "Seat near the teacher"], review: d(40) };
    const E = (kind, x) => ({ id: "e" + Math.random().toString(36).slice(2), kind, date: d(-Math.floor(Math.random() * 20) - 1), desc: "Something happened in class.", files: [], ...x });
    state.entries.push(E("incident", { sev: "high", involved: "Another student", where: "Bus" }), E("missed", { vtype: "Extra time on tests" }), E("comm", { method: "Email", withwho: "Mr. Lee" }),
      E("meeting", { transcript: "[00:01] We agreed to add extra time.", attendees: "Ms. Ross", agreed: "Extra time", actions: "Send plan" }));
    state.health = [{ id: "h1", type: "Therapy or counseling", date: d(-5), what: "Started counseling", note: "" }];
    state.reports = [{ id: "r1", type: "Report card", period: "Q1", date: d(-10), grades: "Math B\nReading A", files: [] }];
    state.docs = [{ id: "d1", name: "IEP 2026", type: "IEP", date: d(-30), files: [] }];
    state.upcoming = [{ id: "u1", mtype: "IEP meeting", title: "Annual IEP review", date: d(3), time: "10:00", minutes: 60, rem1: 1440, rem2: 60, who: "Ms. Ross", place: "School office" }];
    save(); renderWho(); show("home");
  });
  const seeded = await s.evaluate(() => ({ v1: localStorage.getItem("kidarmor.v1"), all: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])) }));
  await s.close();
  const results = { errors: [], dead: [], stuck: [], clicked: 0 };
  async function fresh() {
    const p = await ctx.newPage(); p._e = []; p.on("pageerror", e => p._e.push(e.message)); p.on("dialog", d => d.dismiss());
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) p._e.push("console: " + m.text()) });
    await p.addInitScript(all => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", 1); for (const [k, v] of Object.entries(all)) localStorage.setItem(k, v) }, seeded.all);
    await p.goto("https://kidarmor.example/"); await p.waitForTimeout(400); return p;
  }
  const sig = p => p.evaluate(() => [location.hash, document.querySelector(".view:not([hidden])")?.id, !!document.querySelector(".sheetwrap"), document.querySelector(".toast")?.textContent || "", document.body.innerHTML.length, document.activeElement?.tagName, [...document.querySelectorAll("details[open]")].length, (window.__dl || 0)].join("|"));
  const labelOf = el => el.evaluate(e => ((e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) || e.getAttribute("aria-label") || e.id || e.className).slice(0, 50));
  for (const v of VIEWS) {
    let p = await fresh();
    await p.evaluate(v => show(v), v); await p.waitForTimeout(200);
    const n = await p.evaluate(() => [...document.querySelectorAll(".view:not([hidden]) button, nav.tabs button")].length);
    for (let i = 0; i < n; i++) {
      if (p._e.length > 0 || i % 12 === 0) { if (p._e.length) results.errors.push(`${v}: ${p._e.join(" | ")}`); await p.close(); p = await fresh(); }
      await p.evaluate(() => { try { closeSheet() } catch (e) { } document.querySelectorAll(".legalview,.wizard,.lockscreen").forEach(x => x.remove()) });
      await p.evaluate(v => show(v), v); await p.waitForTimeout(80);
      const btn = (await p.$$(".view:not([hidden]) button, nav.tabs button"))[i]; if (!btn) continue;
      const lab = await labelOf(btn);
      if (!(await btn.isVisible()) || await btn.isDisabled() || SKIP.test(lab)) continue;
      // open any collapsed card holding the button
      const before = await sig(p);
      try { await btn.click({ timeout: 2000 }) } catch (e) { continue }
      results.clicked++; await p.waitForTimeout(450);
      const after = await sig(p);
      if (before === after) results.dead.push(`${v}: "${lab}"`);
      // one level into a sheet
      if (await p.$(".sheetwrap")) {
        const sb = await p.$$(".sheetwrap button"); const labs = []; for (const x of sb) labs.push(await labelOf(x));
        if (!labs.some(l => /cancel|close|done|not now|back|×|no thanks|later|skip|ok|got it/i.test(l))) results.stuck.push(`${v}: "${lab}" → sheet buttons: ${labs.join(", ")}`);
        for (let j = 0; j < sb.length; j++) {
          if (SKIP.test(labs[j])) continue;
          if (!(await p.$(".sheetwrap"))) { try { await btn.click({ timeout: 1500 }); await p.waitForTimeout(300) } catch (e) { break } }
          const x = (await p.$$(".sheetwrap button"))[j]; if (!x || !(await x.isVisible()) || await x.isDisabled()) continue;
          try { await x.click({ timeout: 1500 }); results.clicked++; await p.waitForTimeout(350) } catch (e) { }
          if (p._e.length) { results.errors.push(`${v}: "${lab}" → "${labs[j]}": ${p._e.join(" | ")}`); p._e.length = 0 }
        }
      }
      if (p._e.length) { results.errors.push(`${v}: "${lab}": ${p._e.join(" | ")}`); p._e.length = 0 }
    }
    await p.close();
  }
  console.log(`clicked ${results.clicked} buttons`);
  console.log("SCRIPT ERRORS:", results.errors.length ? "\n  " + [...new Set(results.errors)].join("\n  ") : "none");
  console.log("NO VISIBLE EFFECT:", results.dead.length ? "\n  " + results.dead.join("\n  ") : "none");
  console.log("SHEETS WITHOUT A CLOSE BUTTON:", results.stuck.length ? "\n  " + results.stuck.join("\n  ") : "none");
  if (results.errors.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.log("  FAIL", e.stack); process.exit(1) });
