const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(process.env.KA_FILE||__dirname+"/../native/src/app.html","utf8");
const page_=html.startsWith("<!doctype")?html:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
async function open(b,vp){const ctx=await b.newContext({viewport:vp,permissions:["microphone","clipboard-read","clipboard-write"]});const p=await ctx.newPage();p._e=[];p.on("pageerror",e=>p._e.push(e.message));await p.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true});
  await p.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:"",contentType:"text/css"}));await p.route("https://kidarmor.example/**",r=>r.fulfill({body:page_,contentType:"text/html"}));return p}
(async()=>{const b=await chromium.launch({args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
const phone=await open(b,{width:390,height:844});await phone.goto("https://kidarmor.example/");
await phone.evaluate(async()=>{state.child={name:"Ava Biehl",parent:"Joshua",school:"Pass Christian Middle",to:"Dr. Pruitt",toemail:"kpruitt@x.org"};state.setupDone=true;save();
  const meta=await storeUpload(new File([new Uint8Array(5000)],"rec.m4a",{type:"audio/mp4"}));
  const lines=["[00:40] She didn't get extra time on her math tests.","[03:10] The school will make sure every teacher gets a copy of the 504 plan by Friday.","[05:00] We agreed to meet again on November 20th."];
  const n=makeMeetingNotes(lines,{t0:Date.now(),secs:600,title:"504 meeting"});
  state.entries.push({id:"m1",kind:"meeting",date:today(),mtype:"504 meeting",desc:n.desc,summary:n.summary,summaryDesc:n.desc,agreed:n.agreed,actions:n.actions,transcript:lines.join("\n")+"\n"+"[09:00] more words here about the plan and the teacher. ".repeat(300),recordings:[meta],files:[]});
  state.entries.push({id:"i1",kind:"incident",date:today(),desc:"Called names on the bus.",parentNote:"I am furious",files:[{id:"x",name:"p.jpg",type:"image/jpeg"}]});save();show("me")});
let saved=false;phone.on("download",()=>saved=true);
await phone.click("#pcLink");await phone.waitForSelector("#lkCode");const code=(await phone.textContent("#lkCode")).trim();
await phone.click("#lkCopy");await phone.waitForTimeout(200);const url=await phone.evaluate(()=>navigator.clipboard.readText());
ok("phone makes a link + code, no file saved",/^https:\/\/kidarmor\.example\/#open=[A-Za-z0-9_-]+$/.test(url)&&/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)&&!saved,`code ${code}, link ${Math.round(url.length/1024)} KB`);
ok("record can't be read from the link",!/Ava|504|bus/.test(decodeURIComponent(url)));
await phone.screenshot({path:__dirname+"/v10-link.png"});
// computer
const pc=await open(b,{width:1280,height:900});await pc.goto(url);await pc.waitForSelector("#olCode");
await pc.fill("#olCode","AAAAA-BBBBB");await pc.click("#olGo");await pc.waitForFunction(()=>/doesn't match/.test(document.querySelector("#olErr").textContent),null,{timeout:8000});ok("wrong code refused",true);
await pc.fill("#olCode",code.toLowerCase());await pc.click("#olGo");await pc.waitForSelector("#olCode",{state:"detached",timeout:8000});
const st=await pc.evaluate(()=>({name:state.child.name,n:state.entries.length,ro:state.readOnly,fp:state.fromPhone,hash:location.hash,banner:document.querySelector("#roBanner").textContent}));
ok("computer opens the whole written record",st.name==="Ava Biehl"&&st.n===2&&st.ro&&st.fp,JSON.stringify(st).slice(0,120));
ok("link removed from the address bar",st.hash==="");
await pc.click('#timeline details.inc:has-text("504 meeting") summary');
ok("summary + transcript tab on the computer",await pc.isVisible("#timeline details[open] .sumblock")&&await pc.isVisible("#timeline details[open] details.txtab"));
ok("says the recording is on the phone",/The recording is on your phone/.test(await pc.textContent("#timeline details[open]")));
await pc.screenshot({path:__dirname+"/v10-computer.png"});
const mail=await pc.evaluate(()=>{$("#l-kind").value="analysis";show("letters");updateEmail();return $("#emailBtn").getAttribute("href")||""});
ok("can send email from the computer",/^mailto:.*subject=Case%20summary/.test(mail),mail.slice(0,60));
// open a newer link again → replaces, not duplicates
await phone.click("#lkDone");await phone.waitForTimeout(400);await phone.click("#pcLink");await phone.waitForSelector("#lkCode");const code2=(await phone.textContent("#lkCode")).trim();await phone.click("#lkCopy");await phone.waitForTimeout(200);const url2=await phone.evaluate(()=>navigator.clipboard.readText());
await pc.goto(url2);await pc.waitForSelector("#olCode");await pc.fill("#olCode",code2);await pc.click("#olGo");await pc.waitForSelector("#olCode",{state:"detached",timeout:8000});
ok("a newer link updates the same case (no duplicate)",await pc.evaluate(()=>root.cases.filter(c=>c.child.name==="Ava Biehl").length===1));
ok("no script errors",!phone._e.length&&!pc._e.length,[...phone._e,...pc._e].join("|")); // professional sharing is covered by test_legal_share.js
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
