/* KidArmor phone app: swaps in the phone's own features. Copyright (c) 2026 Coastline Code LLC. */
(function(){
  if(!window.KA_NATIVE)return;
  var C=window.Capacitor,P=function(n){return C.registerPlugin?C.registerPlugin(n):(C.Plugins&&C.Plugins[n])};
  var LN=P("LocalNotifications"),FS=P("Filesystem"),SH=P("Share"),APP=P("App"),BIO=P("NativeBiometric"),CAL=P("CapacitorCalendar");
  document.documentElement.classList.add("native");
  try{console.log("KA_NATIVE_OK "+JSON.stringify({registerPlugin:!!C.registerPlugin,plugins:Object.keys(C.Plugins||{}).sort()}))}catch(e){}
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
      try{await FS.rmdir({path:"kidarmor-out",directory:"CACHE",recursive:true})}catch(e){} /* only the file being shared now is kept */
      var w=await FS.writeFile({path:"kidarmor-out/"+name,data:await b64(blob),directory:"CACHE",recursive:true});
      await SH.share({title:name,files:[w.uri]});return true}
    catch(e){if(/cancel/i.test((e&&e.message)||""))return false;toast("Couldn't save the file.");return false}};
  /* "Erase everything": remove files this app saved for sharing, and pending reminders */
  window.KA_NATIVE_WIPE=async function(){try{await FS.rmdir({path:"kidarmor-out",directory:"CACHE",recursive:true})}catch(e){}
    try{var LN=P("LocalNotifications");var p=await LN.getPending();if(p&&p.notifications&&p.notifications.length)await LN.cancel({notifications:p.notifications.map(function(n){return{id:n.id}})})}catch(e){}};
  /* phone calendar: add the meeting with its two reminders */
  window.addToCalendar=async function(m){
    var s=meetStart(m),e=new Date(s.getTime()+(m.minutes||60)*60000),title=(m.title||m.mtype)+(state.child.name?" ("+state.child.name.split(" ")[0]+")":"");
    var notes=[m.who?"Who: "+m.who:"",m.link?"Join: "+m.link:"","Open KidArmor when it starts and tap Record this meeting."].filter(Boolean).join("\n");
    try{var alerts=[m.rem1,m.rem2].filter(function(x){return x!=null}).map(function(x){return -x});
      await CAL.createEventWithPrompt({title:title,location:m.place||"",startDate:s.getTime(),endDate:e.getTime(),description:notes,url:/^https?:/.test(m.link||"")?m.link:undefined,alerts:alerts.length?alerts:undefined});
      m.calAddedAt=new Date().toISOString();save();renderHome();toast("Meeting added to your calendar.");return true}
    catch(err){if(/cancel/i.test((err&&err.message)||""))return false;
      var name=(m.title||m.mtype).replace(/[^\w .-]/g,"")+" "+m.date+".ics";var ok=await window.saveFile(name,new Blob([makeIcs(m)],{type:"text/calendar"}));
      if(ok){m.calAddedAt=new Date().toISOString();save();renderHome()}return ok}};
  /* notifications: real reminders, even when KidArmor is closed.
     isExactNotification:false: on Android 12+ an "exact" reminder makes the plugin open the phone's
     "Alarms & reminders" settings screen whenever the app isn't allowed exact alarms (the default on
     Android 14+). Meeting reminders don't need to-the-second timing, so never send parents there. */
  function N(t,o){LN.schedule({notifications:[{id:200000+Math.floor(Math.random()*700000),title:t,body:(o&&o.body)||"",isExactNotification:false}]}).catch(function(){})}
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
    root.cases.forEach(function(c){if(c.readOnly||c.example)return;(c.upcoming||[]).forEach(function(m){if(m.doneEntry)return;[m.rem1,m.rem2].forEach(function(r){if(r==null)return;
      var at=new Date(meetStart(m).getTime()-r*60000);if(at.getTime()>now+5000&&id<199000)list.push({id:id++,title:(m.title||m.mtype)+(r?" in "+remLabel(r).replace(" before",""):" is starting"),body:fmtWhen(m)+(m.place?" · "+m.place:""),schedule:{at:at,allowWhileIdle:true},isExactNotification:false})})})});
    if(list.length)await LN.schedule({notifications:list})}catch(e){}}
  var _save=window.save;window.save=function(){var r=_save.apply(this,arguments);clearTimeout(syncT);syncT=setTimeout(syncReminders,1500);return r};
  window.askNotify=function(){if(N.permission==="default")N.requestPermission().then(function(){try{renderPerms()}catch(e){}})};
  setTimeout(syncReminders,3000);setTimeout(function(){FS.rmdir({path:"kidarmor-out",directory:"CACHE",recursive:true}).catch(function(){});FS.rmdir({path:"kidarmor-tx",directory:"CACHE",recursive:true}).catch(function(){})},5000);
  /* meeting transcripts on Android: while recording, Android gives the microphone to the recording
     and silence to the speech recognizer, so live transcripts come out empty. On Android 13+ KidArmor
     records first and then has the phone write the transcript from the saved recording, on the phone. */
  var KT=C.getPlatform&&C.getPlatform()==="android"?P("KaTranscribe"):null;
  window.KA_STT_AFTER=false;
  if(KT)KT.available().then(function(r){window.KA_STT_AFTER=!!(r&&r.supported);if(window.KA_STT_AFTER){try{renderHome()}catch(e){}}}).catch(function(){});
  async function writeBlob(path,blob){var CH=3*1024*1024;for(var i=0;i<blob.size||i===0;i+=CH){var part=blob.slice(i,i+CH),data=await b64(part);
      if(i===0)await FS.writeFile({path:path,data:data,directory:"CACHE",recursive:true});else await FS.appendFile({path:path,data:data,directory:"CACHE"});if(!blob.size)break}}
  window.KA_TRANSCRIBE_AFTER=async function(parts,onProgress){
    var lines=[],offset=0,h=null;
    try{if(onProgress)h=await KT.addListener("progress",function(p){try{onProgress(p.done||0)}catch(e){}})}catch(e){}
    try{
      for(var i=0;i<parts.length;i++){var blob=parts[i].blob;if(!blob||!blob.size)continue;
        var ty=parts[i].type||blob.type||"",name="kidarmor-tx/part"+i+(ty.indexOf("mp4")>=0?".m4a":ty.indexOf("ogg")>=0?".ogg":".webm");
        await writeBlob(name,blob);var uri=(await FS.getUri({path:name,directory:"CACHE"})).uri;
        var r=await KT.transcribe({path:uri,onDevice:!!(window.KA_STT_LOCAL&&window.KA_STT_LOCAL()),language:"en-US"});
        (r.segments||[]).forEach(function(s){lines.push("["+mmss(offset+(s.t||0))+"] "+s.text)});
        offset+=r.seconds||0}
    }finally{try{h&&h.remove()}catch(e){}try{await FS.rmdir({path:"kidarmor-tx",directory:"CACHE",recursive:true})}catch(e){}}
    return lines};
  /* app version for the feedback email, and the store's own rating prompt */
  window.KA_APPINFO=async function(){var i=await APP.getInfo();return{version:i.version,build:i.build}};
  window.KA_RATE=async function(){var R=P("InAppReview");if(!R)throw new Error("no review plugin");await R.requestReview()};
  /* links: outside websites open in the phone's browser */
  document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="http"]');if(!a||e.defaultPrevented)return;
    if(a.target==="_blank"){e.preventDefault();window.location.href=a.href}},true);
  /* links from teachers and the computer: kidarmor://open#upd=... */
  APP.addListener("appUrlOpen",function(d){var u=(d&&d.url)||"";var i=u.indexOf("#");if(i<0)return;var h=u.slice(i);
    /* only teacher updates and shared-case links may arrive from outside the app; never move links */
    if(/^#(upd|open)=[A-Za-z0-9_.-]{1,60000}$/.test(h)){location.hash=h}});
  /* Android back button */
  APP.addListener("backButton",function(){
    var v=document.querySelector(".viewer");if(v){try{closeViewer()}catch(e){}return}
    var w=document.querySelector(".sheetwrap");if(w&&!w.dataset.lock){closeSheet();return}
    if(document.querySelector(".lockscreen,.wizard"))return;
    if(current!=="home"){show("home");return}
    APP.minimizeApp().catch(function(){})});
})();
