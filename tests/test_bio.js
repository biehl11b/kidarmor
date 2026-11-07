const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
const page_='<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>'+html+"</body></html>";
const ok=(n,c,x="")=>{console.log((c?"  ok   ":"  FAIL ")+n+(x?"  → "+x:""));if(!c)process.exitCode=1};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await p.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true});const errs=[];p.on("pageerror",e=>errs.push(e.message));
const cdp=await ctx.newCDPSession(p);await cdp.send("WebAuthn.enable");
const {authenticatorId}=await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
await p.route("https://fonts.googleapis.com/**",r=>r.fulfill({body:"",contentType:"text/css"}));
await p.route("https://kidarmor.example/",r=>r.fulfill({body:page_,contentType:"text/html"}));await p.goto("https://kidarmor.example/");
await p.click("#startOwn");await p.fill("#s-child","Ava");await p.click("#setupForm button[type=submit]");await p.waitForSelector("#fsDone",{timeout:3000}).then(()=>p.click("#fsDone")).catch(()=>{});
await p.click('nav.tabs button[data-v="me"]');await p.waitForTimeout(300);
ok("biometric needs a PIN first",await p.isDisabled("#bioToggle"),await p.textContent("#bioStatus"));
await p.fill("#pin1","2468");await p.fill("#pin2","2468");await p.click("#pinSave");await p.waitForTimeout(400);
await p.click("#bioToggle");await p.waitForFunction(()=>!!localStorage.getItem("kidarmor.bio"),null,{timeout:8000});
ok("Face ID / fingerprint turned on",/Turn off/.test(await p.textContent("#bioToggle")));
await p.reload();await p.waitForSelector(".lockscreen #lockBio");
ok("lock screen offers Face ID first, PIN below",await p.isVisible("#lockPin"));
await p.waitForSelector(".lockscreen",{state:"detached",timeout:8000});ok("unlocks with face / finger by itself",true);
// failure → PIN
await cdp.send("WebAuthn.setUserVerified",{authenticatorId,isUserVerified:false});
await p.reload();await p.waitForSelector("#lockBio");
await p.waitForFunction(()=>/Tap Use|didn't sign/.test(document.querySelector("#lockBioMsg").textContent),null,{timeout:15000});
ok("failed scan says to use the PIN",await p.isVisible(".lockscreen"));
await p.fill("#lockPin","1111");await p.click("#lockGo");await p.waitForTimeout(300);
ok("wrong PIN refused",/isn't right/.test(await p.textContent("#lockErr")));
await p.fill("#lockPin","2468");await p.click("#lockGo");await p.waitForSelector(".lockscreen",{state:"detached"});ok("PIN backup unlocks",true);
// 5 wrong
await p.reload();await p.waitForSelector("#lockPin");for(let i=0;i<5;i++){await p.fill("#lockPin","0000");await p.click("#lockGo");await p.waitForTimeout(250)}
ok("5 wrong PINs → 30 second wait",/30 seconds/.test(await p.textContent("#lockErr")));
await p.fill("#lockPin","2468");await p.click("#lockGo");await p.waitForTimeout(300);ok("even right PIN waits",await p.isVisible(".lockscreen"));
ok("no script errors",errs.length===0,errs.join("|"));
// iframe: explains instead
const p2=await ctx.newPage();await p2.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true});await p2.route("https://host.example/",r=>r.fulfill({body:'<iframe src="https://kidarmor.example/" width=390 height=800></iframe>',contentType:"text/html"}));
await p2.route("https://kidarmor.example/",r=>r.fulfill({body:page_,contentType:"text/html"}));await p2.goto("https://host.example/");
const f=p2.frames()[1];const sup=await f.evaluate(()=>bioSupported());ok("inside the Claude link it isn't offered (PIN only)",sup===false);
await b.close()})().catch(e=>{console.log("  FAIL",e.message);process.exit(1)});
