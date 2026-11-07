const { chromium } = require("playwright");const fs=require("fs");
const html=fs.readFileSync(__dirname+"/../native/src/app.html","utf8");
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.addInitScript(()=>{window.__kaSkipTerms=true;window.__kaSkipWizard=true});
await p.route("https://k.example/",r=>r.fulfill({body:'<!doctype html><meta charset=utf-8><body>'+html,contentType:"text/html"}));await p.goto("https://k.example/");
const L=["Before we start I want everyone to know I'm recording this meeting is everyone okay with that","yes that's fine","okay thank you","so we're here to talk about Ava's 504 plan and how things have been going this semester",
"she has extra time on tests in her plan but she told me she didn't get it on the last two math tests","Mrs Carter did you know about the extra time accommodation","I wasn't aware it applied to the unit tests I thought it was only for state testing",
"it applies to all tests and quizzes that's written right on page two of the plan","okay I understand now","um yeah","we will make sure every teacher has a copy of the 504 plan by Friday",
"and Mr Lee will check in with the teachers next week to confirm","what about the two math tests she already failed","we can let her retake both tests with extended time before the end of the grading period",
"I'm also concerned about the kids on the bus who keep calling her names","she came home upset three times this month","the counselor will meet with Ava every Tuesday starting next week",
"and we'll talk to the bus driver and review the camera footage","can you send me an email confirming all of this","yes I'll send a summary email today","we agreed to meet again on November 20th at 3:30 to see how it's going","alright thank you everyone"];
const lines=L.map((l,i)=>`[${String(Math.floor(i*40/60)).padStart(2,"0")}:${String(i*40%60).padStart(2,"0")}] ${l}`);
const n=await p.evaluate(l=>makeMeetingNotes(l,{t0:Date.now(),secs:900,announcedAt:1,title:"504 meeting"}),lines);
console.log(n.desc);await b.close()})();
