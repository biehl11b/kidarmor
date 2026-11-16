/* Test build only (never in the store app): collects script errors, and on request skips the
   first-run screens the browser tests already cover, like the Android test does. */
(function(){
  window.__kaErrs=[];
  window.addEventListener("error",function(e){window.__kaErrs.push(String(e.message||e)+" @"+(e.filename||"").split("/").pop()+":"+e.lineno)});
  window.addEventListener("unhandledrejection",function(e){var r=e.reason;window.__kaErrs.push("promise: "+String(r&&r.message||r))});
  try{if(localStorage.getItem("ka_test_skip")){window.__kaSkipTerms=true;window.__kaSkipWizard=true}}catch(e){}
})();
