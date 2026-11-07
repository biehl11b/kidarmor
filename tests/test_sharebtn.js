const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
const page_='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const route=async p=>{p._e=[];p.on("pageerror",e=>p._e.push(e.message));await p.route("https://kidarmor.example/**",r=>{const u=r.request().url();if(u.split("#")[0].endsWith("/"))return r.fulfill({body:page_,contentType:"text/html"});const m=u.match(/vendor\/(.+)$/);if(m&&fs.existsSync(__dirname+"/../vendor/"+m[1]))return r.fulfill({body:fs.readFileSync(__dirname+"/../vendor/"+m[1]),contentType:/css$/.test(u)?"text/css":"font/woff2"});r.fulfill({status:404,body:""})})};
// demo for attorneys
const d=await ctx.newPage();await d.addInitScript(()=>{window.__kaSkipWizard=true});await route(d);await d.goto("https://kidarmor.example/#attorney-demo");await d.waitForTimeout(1200);
ok("demo: no agree screen for attorneys",!(await d.isVisible(".agreescreen")));
const btn=d.locator("#resLaw [data-sharepro]");ok("demo listing has Share my case button",await btn.count()===1,await btn.first().textContent());
await btn.first().scrollIntoViewIfNeeded();await d.screenshot({path:"kidarmor-listing-share-button.png"});
await btn.first().click();await d.waitForSelector("#dsDone");ok("demo explains how sharing works",/locked link/.test(await d.textContent(".sheet")));
await d.screenshot({path:"kidarmor-listing-share-explainer.png"});
// real listing
const p=await ctx.newPage();await p.addInitScript(()=>{window.__kaSkipWizard=true;window.__kaSkipTerms=true});await route(p);await p.goto("https://kidarmor.example/");
await p.click("#startOwn").catch(()=>{});await p.fill("#s-child","Ava");await p.click("#setupForm button[type=submit]");await p.waitForSelector("#fsDone",{timeout:3000}).then(()=>p.click("#fsDone")).catch(()=>{});
await p.evaluate(()=>{state.entries.push({id:"e1",kind:"incident",date:"2026-10-02",desc:"x"});root.profile=root.profile||{};root.profile.state="MS";RESDATA.attorneys=[{kind:"advocate",states:["MS"],name:"Jane Roe",firm:"Roe Advocacy",email:"jane@example.com",phone:"(228) 555-0199"}];save();renderLawyers()});
await p.click('nav.tabs button[data-v="res"]');await p.waitForTimeout(300);
const b2=p.locator('#resLaw [data-shname="Jane Roe"]');ok("real listing has the button",await b2.count()===1,await b2.textContent().catch(()=>""));
await b2.click();await p.waitForSelector("#prWho");
const v=await p.evaluate(()=>({who:$("#prWho").value,name:$("#prName").value,email:$("#prEmail").value,n:document.querySelectorAll("#prSecs input:checked").length}));
ok("opens Share filled in for that person",v.who==="advocate"&&v.name==="Jane Roe"&&v.email==="jane@example.com"&&v.n===7,JSON.stringify(v));
ok("no script errors",!d._e.length&&!p._e.length,d._e.concat(p._e).join("|"));
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
