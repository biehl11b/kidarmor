const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
const page_='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
async function open(b,local){const ctx=await b.newContext({viewport:{width:390,height:844},permissions:["microphone"]});const p=await ctx.newPage();
  await p.addInitScript(([local])=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true;window.__srStarts=[];
    function FakeSR(){this.continuous=false;this.interimResults=false;this.lang="en-US"}
    if(local)FakeSR.prototype.processLocally=false;
    FakeSR.prototype.start=function(){window.__srStarts.push({processLocally:this.processLocally})};FakeSR.prototype.stop=function(){this.onend&&this.onend()};FakeSR.prototype.abort=FakeSR.prototype.stop;
    window.SpeechRecognition=FakeSR},[local]);
  p._e=[];p.on("pageerror",e=>p._e.push(e.message));
  await p.route("https://kidarmor.example/**",r=>{const u=r.request().url();if(u.endsWith("/"))return r.fulfill({body:page_,contentType:"text/html"});r.fulfill({status:404,body:""})});
  await p.goto("https://kidarmor.example/");await p.click("#startOwn").catch(()=>{});await p.fill("#s-child","Ava");await p.click("#setupForm button[type=submit]");await p.waitForSelector("#fsDone",{timeout:3000}).then(()=>p.click("#fsDone")).catch(()=>{});return p}
(async()=>{const b=await chromium.launch({args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
// 1. browser without on-phone speech: choose "phone" -> records, no transcript, explains
let p=await open(b,false);
await p.click("#homeRecord");await p.waitForSelector(".legalview [data-stt]",{timeout:3000});
ok("asks how to make transcripts on first record",/Most private/.test(await p.textContent(".legalview")));
ok("explains pros and cons",await p.locator(".legalview li.pro").count()===3&&await p.locator(".legalview li.con").count()===4);
await p.click('.legalview [data-stt="phone"]');await p.waitForSelector("#recStart",{timeout:3000});
ok("then opens the recorder",true);
await p.click("#recStart");await p.waitForSelector("#recTime");await p.waitForTimeout(800);
const st=await p.evaluate(()=>({starts:window.__srStarts.length,err:REC.srError,note:(document.querySelector("#recNote")||{}).textContent||""}));
ok("phone-only + no on-phone speech: no transcript started",st.starts===0&&st.err==="on-device-unavailable",JSON.stringify(st));
ok("recorder says why, recording continues",/can't make transcripts on the phone itself/.test(st.note),st.note.slice(0,90));
await p.evaluate(()=>stopRecording&&stopRecording()).catch(()=>{});await p.waitForTimeout(500);
// settings panel shows and changes it
await p.evaluate(()=>{closeSheet();document.querySelectorAll(".legalview").forEach(x=>x.remove())});
await p.click('nav.tabs button[data-v="me"]');await p.waitForTimeout(200);
ok("Transcripts setting shows the choice",/on this phone only/.test(await p.textContent("#sttNow")));
await p.click("#sttChange");await p.click('.legalview [data-stt="service"]');
ok("can switch to Apple/Google",/Apple or Google speech service/.test(await p.textContent("#sttNow")));
ok("no script errors (1)",p._e.length===0,p._e.join("|"));
// 2. browser WITH on-phone speech: phone mode sets processLocally
let q=await open(b,true);await q.evaluate(()=>localStorage.setItem("kidarmor.stt","phone"));
await q.click("#homeRecord");await q.waitForSelector("#recStart",{timeout:3000});
ok("doesn't ask again once chosen",!(await q.isVisible(".legalview")));
await q.click("#recStart");await q.waitForSelector("#recTime");await q.waitForTimeout(500);
const s2=await q.evaluate(()=>window.__srStarts);ok("phone-only asks the browser to transcribe locally",s2.length>=1&&s2[0].processLocally===true,JSON.stringify(s2));
// 3. service mode: normal
await q.evaluate(()=>{stopRecording()});await q.waitForTimeout(400);await q.evaluate(()=>{localStorage.setItem("kidarmor.stt","service");window.__srStarts=[];closeSheet()});
await q.click("#homeRecord");await q.click("#recStart");await q.waitForTimeout(500);
const s3=await q.evaluate(()=>window.__srStarts);ok("Apple/Google mode transcribes normally",s3.length>=1&&s3[0].processLocally===false,JSON.stringify(s3));
ok("no script errors (2)",q._e.length===0,q._e.join("|"));
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
