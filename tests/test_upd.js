const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(process.env.KA_FILE||__dirname+"/../native/src/app.html","utf8");
const page_=html.startsWith("<!doctype")?html:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
async function open(b){const ctx=await b.newContext({viewport:{width:390,height:844},permissions:["clipboard-read","clipboard-write"]});const p=await ctx.newPage();p._e=[];p.on("pageerror",e=>p._e.push(e.message));
  await p.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:"",contentType:"text/css"}));await p.route("https://kidarmor.example/**",r=>r.fulfill({body:page_,contentType:"text/html"}));return p}
(async()=>{const b=await chromium.launch();
const parent=await open(b);await parent.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true});await parent.goto("https://kidarmor.example/");
await parent.evaluate(()=>{root.profile={name:"Joshua Biehl",email:"j@x.com",state:"MS"};state.child={name:"Ava Biehl",parent:"Joshua Biehl"};const c2=blank();c2.child={name:"Sam Biehl",parent:"Joshua Biehl"};root.cases.push(c2);save();show("home")});
await parent.click("#homeInvite");await parent.waitForSelector("#ivCopy");await parent.click("#ivCopy");await parent.waitForTimeout(200);const invite=await parent.evaluate(()=>navigator.clipboard.readText());
ok("parent gets an invite link for teachers",/#send=/.test(invite),Math.round(invite.length)+" chars");
// teacher: no app, no account, no setup screens
const teacher=await open(b);await teacher.goto(invite);await teacher.waitForSelector("#sdName");
ok("teacher sees a simple form about Ava, no setup or lock",/about Ava/.test(await teacher.textContent(".wizard h2"))&&!(await teacher.$("#wzName"))&&!(await teacher.$(".lockscreen")));
await teacher.click("#sdMake");ok("teacher name required",/name/.test(await teacher.textContent("#sdErr")));
await teacher.fill("#sdName","Ms. Smith");await teacher.selectOption("#sdRole","Special education teacher");await teacher.fill("#sdOrg","Pass Christian Middle");
await teacher.selectOption("#sdKind","Accommodations or services");await teacher.fill("#sdText","Ava used her extra time on today's math test and finished every question.");
await teacher.screenshot({path:__dirname+"/v13-teacher.png",fullPage:true});
await teacher.click("#sdMake");await teacher.waitForSelector("#sdOut:not([hidden])");await teacher.click("#sdCopy");await teacher.waitForTimeout(200);const upd=await teacher.evaluate(()=>navigator.clipboard.readText());
ok("teacher gets a link to send",/#upd=/.test(upd));
// parent taps it
await parent.goto(upd);await parent.waitForSelector("#upAdd");const t=await parent.textContent(".sheet");
ok("parent is asked before it's added",/Update from Ms\. Smith/.test(t)&&/extra time/.test(t));
ok("goes to the right child (Ava, not Sam)",await parent.evaluate(()=>root.cases[+document.querySelector("#upKid").value].child.name==="Ava Biehl"));
await parent.screenshot({path:__dirname+"/v13-parent.png"});
await parent.click("#upAdd");
const e=await parent.evaluate(()=>({who:state.child.name,e:state.entries.find(x=>x.updateId)}));
ok("saved in Ava's case as a school contact",e.who==="Ava Biehl"&&e.e&&e.e.kind==="comm"&&/Ms\. Smith/.test(e.e.withwho)&&/extra time/.test(e.e.desc),e.e&&e.e.withwho);
ok("link removed from address bar",await parent.evaluate(()=>location.hash===""));
await parent.goto(upd);await parent.waitForSelector("#upAdd");ok("same update twice is flagged",/already in your case/.test(await parent.textContent(".sheet")));
// teacher with no invite
const t2=await open(b);await t2.goto("https://kidarmor.example/#send");await t2.waitForSelector("#sdName");ok("plain teacher page works without an invite",await t2.inputValue("#sdName")==="");
ok("no script errors",![...parent._e,...teacher._e,...t2._e].length,[...parent._e,...teacher._e,...t2._e].join("|"));
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
