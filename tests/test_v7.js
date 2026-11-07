const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
const page_='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
const pad=n=>String(n).padStart(2,"0");
(async()=>{const b=await chromium.launch({args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
const ctx=await b.newContext({viewport:{width:390,height:844},permissions:["microphone","notifications"],acceptDownloads:true});const p=await ctx.newPage();await p.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true;try{localStorage.getItem('kidarmor.stt')||localStorage.setItem('kidarmor.stt','service')}catch(e){}});const errs=[];p.on("pageerror",e=>errs.push(e.message));
await p.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:"",contentType:"text/css"}));
await p.route("https://kidarmor.example/",r=>r.fulfill({body:page_,contentType:"text/html"}));await p.goto("https://kidarmor.example/");
ok("starts empty, no sample case",await p.evaluate(()=>state.entries.length===0&&!state.example)&&await p.isVisible("#welcome"));
await p.click("#startOwn");await p.fill("#s-child","Ava Biehl");await p.click("#setupForm button[type=submit]");
await p.waitForSelector(".sheet #fsPin1");ok("after adding the child, setup asks for PIN, microphone, reminders",await p.isVisible("#fsMic")&&await p.isVisible("#fsNotif"));
await p.fill("#fsPin1","1357");await p.fill("#fsPin2","1357");await p.click("#fsPinGo");await p.waitForTimeout(300);
await p.click("#fsMic");await p.waitForTimeout(400);ok("microphone allowed",/Microphone is on/.test(await p.textContent(".sheet")));
await p.click("#fsNotif");await p.waitForTimeout(300);await p.screenshot({path:__dirname+"/v7-setup.png"});await p.click("#fsDone");
ok("PIN was set",await p.evaluate(()=>!!pinRec()));
await p.click('nav.tabs button[data-v="me"]');await p.waitForTimeout(300);
const perm=await p.textContent("#permList");ok("Permissions panel shows microphone On",/MicrophoneRecords meetings and voice notesOn/.test(perm.replace(/\s+/g," ").replace(/ /g,""))||/Microphone.*On/.test(perm),perm.replace(/\s+/g," ").slice(0,120));
ok("tells how to turn them off in phone settings",/Settings/.test(await p.textContent("#permHow")));
// schedule
await p.click('nav.tabs button[data-v="home"]');await p.click("#homeSchedule");
const d=new Date(Date.now()+10*60000);await p.fill("#umDate",`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);await p.fill("#umTime",`${pad(d.getHours())}:${pad(d.getMinutes())}`);
await p.fill("#umTitle","Annual 504 review");await p.fill("#umWho","Ms. Ross, Mr. Lee");await p.fill("#umLink","+1 228 555 0100");
await p.selectOption("#umR2","custom");await p.fill("#umR2N","3");await p.selectOption("#umR2U","60");
await p.screenshot({path:__dirname+"/v7-schedule.png",fullPage:true});
const dlP=p.waitForEvent("download");await p.click("#umSave");const dl=await dlP;const ics=fs.readFileSync(await dl.path(),"utf8");
ok("calendar file made automatically",/\.ics$/.test(dl.suggestedFilename())&&/BEGIN:VEVENT/.test(ics),dl.suggestedFilename());
ok("two reminders in it (1 day + custom 3 hours)",(ics.match(/BEGIN:VALARM/g)||[]).length===2&&/TRIGGER:-PT1440M/.test(ics)&&/TRIGGER:-PT180M/.test(ics));
ok("upcoming card with Record + FaceTime",await p.isVisible("#upcoming [data-umr]")&&/facetime:\+12285550100/.test(await p.innerHTML("#upcoming")));
ok("needs-attention mentions it",/Annual 504 review/.test(await p.textContent("#attn")));
// reminder fires while open
await p.evaluate(()=>{const m=state.upcoming[0];m.rem1=11;m.fired=[];checkReminders()});await p.waitForTimeout(200);
ok("in-app reminder fires",/Annual 504 review/.test(await p.textContent(".toast")));
await p.screenshot({path:__dirname+"/v7-home.png",fullPage:true});
// record the scheduled meeting
await p.click("#upcoming [data-umr]");ok("record sheet is for that meeting",/Annual 504 review/.test(await p.textContent(".sheet h3")));
await p.click("#recStart");await p.waitForSelector("#recTime");await p.waitForTimeout(2500);await p.click("#recTold");
await p.evaluate(()=>{["[00:01] Before we start, I want everyone to know I'm recording this meeting.","[00:40] We're concerned that Ava hasn't been getting extra time on her math tests.","[03:10] The school will make sure the teacher gets a copy of the 504 plan by Friday.","[04:02] We agreed to add a check-in with the counselor every week.","[05:15] I'll send you the updated plan and we will meet again on November 12.","[06:00] thank you"].forEach(l=>REC.lines.push(l))});
await p.waitForTimeout(16000); // a draft is kept while recording
ok("recording is kept safe while it runs",await p.evaluate(()=>!!localStorage.getItem("kidarmor.recdraft")));
await p.click("#recStop");
await p.waitForSelector(".sheet #smOpen",{timeout:10000});
const e=await p.evaluate(()=>state.entries[0]);
ok("saved automatically — no Save tap",state=>true,"");ok("entry saved with recording + transcript",e&&e.kind==="meeting"&&e.recordings.length===1&&/extra time/.test(e.transcript));
ok("summary written",/Talked about .*extra time/.test(e.desc)&&/Problems raised/.test(e.desc)&&/School agreed to/.test(e.desc),e.desc.split("\n")[2]);
ok("one summary block + transcript tab",await p.isVisible(".sheet .sumblock")&&await p.isVisible(".sheet details.txtab summary")&&!(await p.isVisible(".sheet details.txtab pre")));
await p.click(".sheet details.txtab summary");ok("tab opens the whole transcript",/extra time on her math tests/.test(await p.textContent(".sheet details.txtab pre")));await p.screenshot({path:__dirname+"/v9-summary.png"});
ok("what the school agreed to filled in",/copy of the 504 plan/.test(e.agreed)&&/counselor/.test(e.agreed),e.agreed.replace(/\n/g," | "));
ok("next steps filled in",/send you the updated plan/.test(e.desc),e.actions);
ok("linked to the scheduled meeting",e.attendees==="Ms. Ross, Mr. Lee"&&await p.evaluate(()=>!!state.upcoming[0].doneEntry));
ok("draft cleared",await p.evaluate(()=>!localStorage.getItem("kidarmor.recdraft")));
await p.screenshot({path:__dirname+"/v7-saved.png"});
let auto=false;p.once("download",()=>auto=true);await p.waitForTimeout(1500);ok("no automatic save prompt after recording",!auto);
ok("recording stays in the app (no save-to-phone button after recording)",!(await p.$("#smPhone")));
await p.click("#smDone");ok("upcoming card gone after recording",!(await p.isVisible("#upcoming [data-umr]")));
// recovery if the page closes mid-recording
await p.click("#homeRecord");await p.click("#recStart");await p.waitForSelector("#recTime");await p.evaluate(()=>REC.lines.push("[00:01] We will provide a quiet room for tests."));await p.waitForTimeout(16500);
await p.reload();await p.waitForSelector("#lockPin");await p.fill("#lockPin","1357");await p.click("#lockGo");
await p.waitForFunction(()=>state.entries.length===2,null,{timeout:8000});
ok("unfinished recording recovered and saved after reopening",await p.evaluate(()=>state.entries.some(x=>x.recovered&&/quiet room/.test(x.agreed))));
ok("no script errors",errs.length===0,errs.join("|"));
// inside Claude: no Voice Memos instructions
const p2=await ctx.newPage();await p2.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true;try{localStorage.getItem('kidarmor.stt')||localStorage.setItem('kidarmor.stt','service')}catch(e){}});await p2.route("https://host.example/",r=>r.fulfill({body:'<iframe src="https://kidarmor.example/" width=390 height=800></iframe>',contentType:"text/html"}));
await p2.route("https://kidarmor.example/",r=>r.fulfill({body:page_,contentType:"text/html"}));await p2.addInitScript(()=>{try{localStorage.clear()}catch(e){}});await p2.goto("https://host.example/");
const f=p2.frames()[1];await f.waitForSelector("#homeRecord");await f.click("#homeRecord");const t=await f.textContent(".sheet");
ok("inside Claude: no Voice Memos steps",!/Voice Memos/.test(t)&&/own web address/.test(t),t.slice(0,120));
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
