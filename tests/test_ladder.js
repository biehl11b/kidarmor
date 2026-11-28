// Who to contact, in order: classroom teacher, then counselor, then principal, then district.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../native/src/app.html"), "utf8");
const page_ = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await page.addInitScript(() => { window.__kaNoMic = true; window.__kaSkipTerms = true; window.__kaSkipWizard = true; window.__kaSkipIntro = true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("https://demo.local/**", r => r.fulfill({ body: page_, contentType: "text/html" }));
  await page.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
  const ok = (name, cond, extra = "") => { console.log((cond ? "  ok   " : "  FAIL ") + name + (extra ? "  → " + extra : "")); if (!cond) process.exitCode = 1 };
  await page.goto("https://demo.local/");
  await page.waitForTimeout(300);

  const lv = await page.evaluate(() => ["Mrs. Owens", "Mr. Daniels, counselor", "Asst. Principal Lee", "District special ed director", "Math teacher", "Tom", "case manager"].map(whoLevel));
  ok("who is who: teacher 1, counselor 2, principal 3, district 4, unknown 0", JSON.stringify(lv) === "[1,2,3,4,1,0,2]", JSON.stringify(lv));
  const nx = await page.evaluate(() => [nextUp("Mrs. Owens"), nextUp("Mr. Daniels, counselor"), nextUp("Asst. Principal Lee"), nextUp("superintendent"), nextUp("Tom")]);
  ok("next step goes up one level each time", nx[0] === "the counselor or case manager" && nx[1] === "the principal" && nx[2] === "the district office" && /advocate/.test(nx[3]) && nx[4] === "", JSON.stringify(nx));

  await page.click("#seeExample"); await page.waitForTimeout(300);
  const att = await page.evaluate(() => needsAttention().map(x => x[0]));
  const overdue = att.find(t => /haven't heard back from Mr\. Daniels/.test(t)) || "";
  ok("overdue reply from the counselor suggests the principal next", /Next step: contact the principal\.$/.test(overdue), overdue);
  const noAns = att.find(t => /No answer from the school/.test(t)) || "";
  ok("unanswered report suggests the next person up", /Next step: contact /.test(noAns), noAns);
  const unrep = att.find(t => /reported yet/.test(t)) || "";
  ok("unreported issues say to start with the classroom teacher", /Start with the classroom teacher\.$/.test(unrep), unrep);
  const es = await page.evaluate(t => T(t), overdue);
  ok("Spanish: next step is translated", /Siguiente paso: comuníquese con el director de la escuela\./.test(es), es);
  const es2 = await page.evaluate(t => T(t), unrep);
  ok("Spanish: start with the teacher is translated", /Empiece con el maestro del salón/.test(es2), es2);

  await page.evaluate(() => openEntry && 0).catch(() => {});
  const lab = await page.evaluate(() => KINDS.missed.fields.find(f => f.k === "reported").l + " | " + KINDS.comm.label + " | " + KINDS.comm.hint);
  ok("forms ask about the classroom teacher first", /Start with the classroom teacher/.test(lab) && /teacher or school/.test(lab) && /then the counselor, then the principal/.test(lab), lab);
  ok("no page errors", !errors.length, errors.join(" | "));
  await browser.close();
})();
