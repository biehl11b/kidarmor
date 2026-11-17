/* Test build only (never in the store app): collects script errors, and on request skips the
   first-run screens the browser tests already cover, like the Android test does. */
(function(){
  window.__kaErrs=[];
  window.addEventListener("error",function(e){window.__kaErrs.push(String(e.message||e)+" @"+(e.filename||"").split("/").pop()+":"+e.lineno)});
  window.addEventListener("unhandledrejection",function(e){var r=e.reason;window.__kaErrs.push("promise: "+String(r&&r.message||r))});
  try{if(localStorage.getItem("ka_test_skip")){window.__kaSkipTerms=true;window.__kaSkipWizard=true}}catch(e){}
})();
/* Answers the iPhone test's requests: it drops req-N.json files in Documents/ka-rpc, this runs
   each one and writes res-N.json back. Plugins are looked up on every tick, because the app's own
   Capacitor script replaces window.Capacitor after this file loads. It writes alive.json once it
   works, and agent-err.txt if it can't, so the test can tell which. */
(function(){
  var D="DOCUMENTS",busy=false,alive=false,lastErr="";
  function fs(){var C=window.Capacitor;if(!C)return null;
    try{return (C.Plugins&&C.Plugins.Filesystem)||(C.registerPlugin&&C.registerPlugin("Filesystem"))||null}catch(e){return null}}
  setInterval(async function(){if(busy)return;var FS=fs();if(!FS)return;busy=true;
    try{
      if(!alive){await FS.writeFile({path:"ka-rpc/alive.json",directory:D,data:JSON.stringify({t:Date.now(),href:location.href}),encoding:"utf8",recursive:true});alive=true}
      var r=await FS.readdir({path:"ka-rpc",directory:D});
      for(var i=0;i<r.files.length;i++){var n=r.files[i].name||r.files[i];var m=/^req-(\d+)\.json$/.exec(n);if(!m)continue;
        var t=await FS.readFile({path:"ka-rpc/"+n,directory:D,encoding:"utf8"});await FS.deleteFile({path:"ka-rpc/"+n,directory:D});
        var out;try{var v=await (new Function("return (async()=>{"+JSON.parse(t.data).body+"\n})()"))();out={v:v===undefined?null:v}}catch(e){out={v:{__err:String(e&&e.stack||e).slice(0,500)}}}
        var s;try{s=JSON.stringify(out)}catch(e){s=JSON.stringify({v:{__err:"answer can't be sent"}})}
        await FS.writeFile({path:"ka-rpc/res-"+m[1]+".json",directory:D,data:s,encoding:"utf8",recursive:true})}
    }catch(e){var msg=String(e&&e.message||e);if(msg!==lastErr){lastErr=msg;window.__kaRpcErr=msg;
      try{await FS.writeFile({path:"ka-rpc/agent-err.txt",directory:D,data:msg,encoding:"utf8",recursive:true})}catch(e2){}}}
    busy=false},300);
})();
