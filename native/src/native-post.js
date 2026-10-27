/* KidArmor phone app: swaps in the phone's own features. Copyright (c) 2026 Coastline Code LLC. */
(function(){
  if(!window.KA_NATIVE)return;
  var C=window.Capacitor,P=function(n){return C.registerPlugin(n)};
  var LN=P("LocalNotifications"),FS=P("Filesystem"),SH=P("Share"),APP=P("App"),BIO=P("NativeBiometric"),CAL=P("CapacitorCalendar");
  document.documentElement.classList.add("native");
  /* microphone: the app's web view can always record on the phone */
  window.micAllowedHere=function(){return !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)};
  /* Face ID / fingerprint */
  window.bioSupported=async function(){try{var r=await BIO.isAvailable();return !!(r&&r.isAvailable)}catch(e){return false}};
  window.bioEnroll=async function(){await BIO.verifyIdentity({reason:"Turn on sign-in for KidArmor",title:"KidArmor"});localStorage.setItem(BIOKEY,JSON.stringify({native:true,at:Date.now()}))};
  window.bioUnlock=async function(){if(!bioRec())return false;try{await BIO.verifyIdentity({reason:"Unlock KidArmor",title:"KidArmor"});return true}catch(e){return false}};
  /* saving files: the phone's share sheet (Save to Files, AirDrop, Mail, Drive) */
  function b64(blob){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(String(r.result).split(",")[1])};r.onerror=no;r.readAsDataURL(blob)})}
  window.saveFile=async function(filename,data){
    try{var blob=data instanceof Blob?data:new Blob([data]);var name=String(filename).replace(/[\\/:*?"<>|]+/g,"-");
      var w=await FS.writeFile({path:name,data:await b64(blob),directory:"CACHE"});
      await SH.share({title:name,files:[w.uri]});return true}
    catch(e){if(/cancel/i.test((e&&e.message)||""))return false;toast("Couldn't save the file.");return false}};
  /* phone calendar: add the meeting with its two reminders */
  window.addToCalendar=async function(m){
    var s=meetStart(m),e=new Date(s.getTime()+(m.minutes||60)*60000),title=(m.title||m.mtype)+(state.child.name?" ("+state.child.name.split(" ")[0]+")":"");
    var notes=[m.who?"Who: "+m.who:"",m.link?"Join: "+m.link:"","Open KidArmor when it starts and tap Record this meeting."].filter(Boolean).join("\n");
    try{var alerts=[m.rem1,m.rem2].filter(function(x){return x!=null}).map(function(x){return -x});
      await CAL.createEventWithPrompt({title:title,location:m.place||"",startDate:s.getTime(),endDate:e.getTime(),notes:notes,url:/^https?:/.test(m.link||"")?m.link:undefined,alertOffsetInMinutes:alerts.length?alerts:undefined});
      m.calAddedAt=new Date().toISOString();save();renderHome();toast("Meeting added to your calendar.");return true}
    catch(err){if(/cancel/i.test((err&&err.message)||""))return false;
      var name=(m.title||m.mtype).replace(/[^\w .-]/g,"")+" "+m.date+".ics";var ok=await window.saveFile(name,new Blob([makeIcs(m)],{type:"text/calendar"}));
      if(ok){m.calAddedAt=new Date().toISOString();save();renderHome()}return ok}};
  /* notifications: real reminders, even when KidArmor is closed */
  function N(t,o){LN.schedule({notifications:[{id:200000+Math.floor(Math.random()*700000),title:t,body:(o&&o.body)||""}]}).catch(function(){})}
  N.permission="default";
  N.requestPermission=async function(){try{var r=await LN.requestPermissions();N.permission=r.display==="granted"?"granted":r.display==="denied"?"denied":"default"}catch(e){}syncReminders();return N.permission};
  LN.checkPermissions().then(function(r){N.permission=r.display==="granted"?"granted":r.display==="denied"?"denied":"default"}).catch(function(){});
  window.Notification=N;
  var syncT=0;
  async function syncReminders(){try{
    var perm=await LN.checkPermissions();if(perm.display!=="granted")return;
    var pend=await LN.getPending();var mine=(pend.notifications||[]).filter(function(n){return n.id>=1000&&n.id<200000});
    if(mine.length)await LN.cancel({notifications:mine.map(function(n){return{id:n.id}})});
    var list=[],id=1000,now=Date.now();
    root.cases.forEach(function(c){(c.upcoming||[]).forEach(function(m){if(m.doneEntry)return;[m.rem1,m.rem2].forEach(function(r){if(r==null)return;
      var at=new Date(meetStart(m).getTime()-r*60000);if(at.getTime()>now+5000&&id<199000)list.push({id:id++,title:(m.title||m.mtype)+(r?" in "+remLabel(r).replace(" before",""):" is starting"),body:fmtWhen(m)+(m.place?" · "+m.place:""),schedule:{at:at,allowWhileIdle:true}})})})});
    if(list.length)await LN.schedule({notifications:list})}catch(e){}}
  var _save=window.save;window.save=function(){var r=_save.apply(this,arguments);clearTimeout(syncT);syncT=setTimeout(syncReminders,1500);return r};
  window.askNotify=function(){if(N.permission==="default")N.requestPermission().then(function(){try{renderPerms()}catch(e){}})};
  setTimeout(syncReminders,3000);
  /* links: outside websites open in the phone's browser */
  document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="http"]');if(!a||e.defaultPrevented)return;
    if(a.target==="_blank"){e.preventDefault();window.location.href=a.href}},true);
  /* links from teachers and the computer: kidarmor://open#upd=... */
  APP.addListener("appUrlOpen",function(d){var u=(d&&d.url)||"";var i=u.indexOf("#");if(i>=0){location.hash=u.slice(i)}});
  /* Android back button */
  APP.addListener("backButton",function(){
    var v=document.querySelector(".viewer");if(v){try{closeViewer()}catch(e){}return}
    var w=document.querySelector(".sheetwrap");if(w&&!w.dataset.lock){closeSheet();return}
    if(document.querySelector(".lockscreen,.wizard"))return;
    if(current!=="home"){show("home");return}
    APP.minimizeApp().catch(function(){})});
})();
