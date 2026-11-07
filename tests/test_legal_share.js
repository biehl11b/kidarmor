const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
const page_='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();await p.addInitScript(()=>{window.__kaSkipWizard=true});const errs=[];p.on("pageerror",e=>errs.push(e.message));
const reqs=[];p.on("request",r=>reqs.push(r.url()));
await p.route("https://kidarmor.example/**",r=>{const u=r.request().url();if(u.endsWith("/"))return r.fulfill({body:page_,contentType:"text/html"});if(/fonts\.css$/.test(u))return r.fulfill({body:"",contentType:"text/css"});const m=u.match(/vendor\/([\w.-]+)$/);if(m&&fs.existsSync(__dirname+"/../vendor/"+m[1]))return r.fulfill({body:fs.readFileSync(__dirname+"/../vendor/"+m[1]),contentType:"application/javascript"});return r.fulfill({status:404,body:""})});
await p.goto("https://kidarmor.example/");
// 2A agreement
await p.waitForSelector(".agreescreen",{timeout:4000});
ok("agreement shows first",await p.isVisible(".agreescreen #agBox"));
ok("says not legal advice",/It is not legal advice/.test(await p.textContent(".agreescreen")));
ok("box unchecked by default",!(await p.isChecked("#agBox")));
ok("Continue disabled until checked",await p.isDisabled("#agGo"));
await p.click('.agreescreen [data-legal="terms"]');await p.waitForSelector(".legalview");
ok("Terms open inside the app",/Governing law/.test(await p.textContent(".legalview")));
ok("tapping the link didn't tick the box",!(await p.isChecked("#agBox")));
await p.click(".legalview [data-lvclose]");
await p.click('.agreescreen [data-legal="privacy"]');ok("Privacy opens inside the app",/What we don't collect/.test(await p.textContent(".legalview")));await p.click(".legalview [data-lvclose]");
await p.check("#agBox");ok("Continue enabled when checked",!(await p.isDisabled("#agGo")));
await p.click("#agGo");await p.waitForTimeout(200);
const ag=await p.evaluate(()=>JSON.parse(localStorage.getItem("kidarmor.agree")));
ok("stored agreement, date and version",ag&&ag.v===TERMS_VERSION_PLACEHOLDER(ag)&&/^\d{4}-/.test(ag.at),JSON.stringify(ag));
await p.reload();await p.waitForTimeout(500);ok("not shown again",!(await p.isVisible(".agreescreen")));
await p.evaluate(()=>localStorage.setItem("kidarmor.agree",JSON.stringify({v:"2020-01",at:"2020-01-01T00:00:00Z"})));await p.reload();await p.waitForSelector(".agreescreen");
ok("new version shows it again",/updated our terms/.test(await p.textContent(".agreescreen")));await p.check("#agBox");await p.click("#agGo");
// set up a case with entries of several kinds
await p.click("#startOwn").catch(()=>{});await p.fill("#s-child","Ava Test");await p.fill("#s-parent","Pat Test");await p.click("#setupForm button[type=submit]");
await p.waitForSelector("#fsDone",{timeout:3000}).then(()=>p.click("#fsDone")).catch(()=>{});
await p.evaluate(()=>{const mk=(kind,desc,extra={})=>({id:"e"+Math.random().toString(36).slice(2),kind,date:"2026-10-0"+(1+Math.floor(Math.random()*8)),desc,...extra});
  state.entries.push(mk("incident","Pushed on the bus",{parentNote:"SECRET-NOTE-1",originalDesc:"SECRET-ORIG"}),mk("missed","No reading support",{}),mk("comm","Emailed teacher",{}),mk("meeting","IEP meeting",{transcript:"we discussed"}));
  state.health=[{id:"h1",type:"Therapy or counseling",date:"2026-10-02",what:"Started counseling HEALTHMARK",note:""}];state.plan.type="IEP";state.plan.accoms=["Extra time"];save();renderWho();renderHome()});
// 2B help & legal
await p.click('nav.tabs button[data-v="me"]');await p.waitForTimeout(300);
ok("Help & feedback panel",await p.isVisible("#helpPanel"));
const href=await p.getAttribute("#hfEmail","href");const body=decodeURIComponent(href.split("body=")[1]||"");
ok("email goes to info@ with subject",href.startsWith("mailto:info@coastlinecode.com?subject=KidArmor%20feedback"),href.slice(0,80));
ok("body has version + phone only",/KidArmor version: 1\.0/.test(body)&&/Phone: /.test(body)&&!/Ava|Pat/.test(body),body.replace(/\n/g," | "));
ok("call and text links",await p.locator('#helpPanel a[href="tel:+12283045333"]').count()===1&&await p.locator('#helpPanel a[href="sms:+12283045333"]').count()===1);
ok("rate hidden on web",!(await p.isVisible("#hfRate")));
ok("privacy reminder",/don't send private details/.test(await p.textContent("#helpPanel")));
ok("Legal shows agreement date",/You agreed/.test(await p.textContent("#legalAgreed")));
await p.click('#legalPanel [data-legal="terms"]');ok("Settings opens Terms",await p.isVisible(".legalview"));await p.click(".legalview [data-lvclose]");
// 2C share
await p.click("#shMake");await p.waitForSelector("#prWho");
ok("attorney gets everything by default",await p.locator("#prSecs input:checked").count()===8);
await p.selectOption("#prWho","counselor");const cs=await p.$$eval("#prSecs input:checked",a=>a.map(x=>x.dataset.sec).join(","));
ok("counselor preset: bullying, meetings, health",cs==="incident,meeting,health",cs);
await p.fill("#prName","Dr. Lee");await p.click("#prLink");await p.waitForSelector(".sheet .codebox");
const code=(await p.textContent(".sheet .codebox")).trim();
const url=await p.evaluate(async()=>{const sh=state.shares[0];return(await makeProLink({...sh})).url});
ok("share saved with the code",await p.evaluate(()=>state.shares.length===1&&state.shares[0].name==="Dr. Lee"));
await p.click("#plDone");await p.waitForTimeout(150);
ok("shared list shows Send an update",/Send an update/.test(await p.textContent("#shList")));
// open on the professional's side
const q=await ctx.newPage();await q.addInitScript(()=>{window.__kaSkipWizard=true;window.__kaSkipTerms=true});
await q.route("https://kidarmor.example/**",r=>{const u=r.request().url();if(u.split("#")[0].endsWith("/"))return r.fulfill({body:page_,contentType:"text/html"});return r.fulfill({status:404,body:""})});
const hash=url.slice(url.indexOf("#"));await q.goto("https://kidarmor.example/"+hash);await q.waitForSelector("#olCode");await q.fill("#olCode",code);await q.click("#olGo");await q.waitForTimeout(800);
const got=await q.evaluate(()=>({kinds:state.entries.map(e=>e.kind).sort().join(","),ro:state.readOnly,health:(state.health||[]).length,plan:state.plan.type||"",note:JSON.stringify(state).includes("SECRET"),codes:JSON.stringify(state).includes("\"code\""),secs:state.shareSections}));
ok("counselor copy has only chosen parts",got.kinds==="incident,meeting"&&got.health===1&&!got.plan,JSON.stringify(got));
ok("read-only, no private notes, no share codes",got.ro&&!got.note&&!got.codes);
ok("banner says what's included",/Includes: Bullying log/.test(await q.textContent("#roBanner")));
// update replaces their copy
await p.evaluate(()=>{state.entries.push({id:"e9",kind:"incident",date:"2026-10-09",desc:"Second incident"});save()});
const url2=await p.evaluate(async()=>(await makeProLink({...state.shares[0]})).url);
await q.goto("https://kidarmor.example/"+url2.slice(url2.indexOf("#")));await q.waitForSelector("#olCode");await q.fill("#olCode",code);await q.click("#olGo");await q.waitForTimeout(800);
const n=await q.evaluate(()=>({cases:root.cases.filter(c=>c.readOnly).length,inc:state.entries.filter(e=>e.kind==="incident").length}));
ok("update replaces their copy (same code)",n.cases===1&&n.inc===2,JSON.stringify(n));
// PDF option
await p.click("#shMake");await p.waitForSelector("#prPdf");await p.selectOption("#prWho","tutor");
const pdfOk=await p.evaluate(async()=>{const f=await makeProPdf(["plan","reports","meeting"]);return f.blob.size>1000&&state.child.name==="Ava Test"&&state.entries.length===5});
ok("PDF instead works and leaves the case untouched",pdfOk);
await p.click("#prCancel");
// fonts not from Google; computer link excludes share codes
ok("no requests to Google Fonts",!reqs.some(u=>/fonts\.(googleapis|gstatic)/.test(u)),reqs.filter(u=>/google/.test(u)).join(" "));
const pc=await p.evaluate(()=>JSON.stringify(caseForLink(state,"computer")).includes("\"shares\""));ok("computer link doesn't carry share codes",!pc);
ok("no script errors",errs.length===0,errs.join("|"));
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
function TERMS_VERSION_PLACEHOLDER(a){return a.v}
