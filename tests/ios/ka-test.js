/* Test build only (never in the store app): collects script errors, and on request skips the
   first-run screens the browser tests already cover, like the Android test does. */
(function(){
  window.__kaErrs=[];
  window.addEventListener("error",function(e){window.__kaErrs.push(String(e.message||e)+" @"+(e.filename||"").split("/").pop()+":"+e.lineno)});
  window.addEventListener("unhandledrejection",function(e){var r=e.reason;window.__kaErrs.push("promise: "+String(r&&r.message||r))});
  try{if(localStorage.getItem("ka_test_skip")){window.__kaSkipTerms=true;window.__kaSkipWizard=true}}catch(e){}
})();
/* Answers the iPhone test's requests: it drops req-N.json files in Documents/ka-rpc, this runs
   each one and writes res-N.json back. */
(function(){
  var C=window.Capacitor;if(!C||!C.isNativePlatform||!C.isNativePlatform())return;
  var FS=C.registerPlugin("Filesystem"),D="DOCUMENTS",busy=false;
  setInterval(async function(){if(busy)return;busy=true;
    try{var r=await FS.readdir({path:"ka-rpc",directory:D});
      for(var i=0;i<r.files.length;i++){var n=r.files[i].name||r.files[i];var m=/^req-(\d+)\.json$/.exec(n);if(!m)continue;
        var t=await FS.readFile({path:"ka-rpc/"+n,directory:D,encoding:"utf8"});await FS.deleteFile({path:"ka-rpc/"+n,directory:D});
        var out;try{var v=await (new Function("return (async()=>{"+JSON.parse(t.data).body+"\n})()"))();out={v:v===undefined?null:v}}catch(e){out={v:{__err:String(e&&e.stack||e).slice(0,500)}}}
        var s;try{s=JSON.stringify(out)}catch(e){s=JSON.stringify({v:{__err:"answer can't be sent"}})}
        await FS.writeFile({path:"ka-rpc/res-"+m[1]+".json",directory:D,data:s,encoding:"utf8",recursive:true})}
    }catch(e){}busy=false},300);
})();
