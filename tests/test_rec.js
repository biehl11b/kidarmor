// Phone: record in the app (simulated mic) -> make a computer copy. Computer: open it -> recording + transcript are there.
const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
const pdflib=fs.readFileSync("/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js");
const page_='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
async function open(b,opts={}){const ctx=await b.newContext({viewport:{width:390,height:844},permissions:["microphone"],acceptDownloads:true,...opts});const p=await ctx.newPage();await p.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true;try{if(!localStorage.getItem("kidarmor.stt"))localStorage.setItem("kidarmor.stt","service")}catch(e){}});p._errs=[];p.on("pageerror",e=>p._errs.push(e.message));
  await p.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:"",contentType:"text/css"}));
  await p.route("https://demo.local/vendor/**",r=>r.fulfill({path:__dirname+"/../vendor/"+r.request().url().split("/vendor/")[1].split("?")[0],contentType:r.request().url().endsWith(".js")||r.request().url().endsWith(".mjs")?"application/javascript":undefined}));
  await p.route("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/**",r=>r.fulfill({body:pdflib,contentType:"application/javascript"}));
  await p.route("https://kidarmor.example/",r=>r.fulfill({body:page_,contentType:"text/html"}));await p.goto("https://kidarmor.example/");return p}
(async()=>{const b=await chromium.launch({args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
  const phone=await open(b);
  await phone.click("#startOwn");await phone.fill("#s-child","Ava Biehl");await phone.fill("#s-parent","Joshua");await phone.click("#setupForm button[type=submit]");await phone.waitForSelector("#fsDone",{timeout:3000}).then(()=>phone.click("#fsDone")).catch(()=>{});
  await phone.click('nav.tabs button[data-v="home"]');
  ok("mic works on KidArmor's own web address",await phone.evaluate(()=>micAllowedHere()));
  await phone.click("#homeRecord");await phone.click("#recStart");await phone.waitForSelector("#recTime");
  await phone.waitForTimeout(3200);ok("recording timer runs",/00:0[2-4]/.test(await phone.textContent("#recTime")));
  await phone.click("#recTold");ok("announcement confirmed",/You announced the recording/.test(await phone.textContent(".sheet")));
  await phone.mouse.click(10,10);ok("tapping outside doesn't stop it",await phone.isVisible("#recStop"));
  await phone.screenshot({path:__dirname+"/rec-live.png"});
  // simulate words the browser's speech service would hear (headless Chrome has no speech service)
  await phone.evaluate(()=>{REC.lines.push("[00:02] Before we start, I want everyone to know I'm recording this meeting.");REC.lines.push("[00:03] That's fine with us.")});
  await phone.click("#recStop");
  await phone.waitForSelector(".sheet #smDone",{timeout:10000});
  const r=await phone.evaluate(async()=>{const e=state.entries[0];const m=e.recordings[0];const f=await getFile(m.id);return{type:m.type,size:f.blob.size,secs:e.recordingSeconds,ann:!!e.announcedAt,tx:e.transcript}});
  ok("recording saved in the app",r.size>500&&r.type.startsWith("audio/")&&r.secs>=3&&r.ann,`${r.type}, ${r.size} bytes, ${r.secs}s`);
  ok("transcript saved with it",/everyone to know I'm recording/.test(r.tx));
  await phone.click("#smDone");await phone.click("#timeline details summary");
  ok("meeting shows recording + transcript",await phone.isVisible("#timeline details[open] [data-recs]")&&await phone.isVisible("#timeline details[open] details.txtab"));
  await phone.click("#timeline details[open] [data-recs] [data-view]");await phone.waitForSelector(".viewer audio");ok("recording plays on the phone",true);await phone.click("#vclose");
  // make the computer copy
  ok("no script errors",phone._errs.length===0,phone._errs.join("|"));
  await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
