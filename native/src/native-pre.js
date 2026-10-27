/* KidArmor phone app: runs before the app. Copyright (c) 2026 Coastline Code LLC. */
(function(){
  var C=window.Capacitor;
  window.KA_NATIVE=!!(C&&C.isNativePlatform&&C.isNativePlatform());
  if(!window.KA_NATIVE)return;
  window.KA_PDFLIB="vendor/pdf-lib.min.js";
  window.KA_PDFJS="vendor/";
  window.KA_HOME_URL="https://biehl11b.github.io/kidarmor/";
  /* Live transcript: use the phone's own speech recognizer when the web one isn't there */
  if(!window.SpeechRecognition&&!window.webkitSpeechRecognition&&(C.registerPlugin||C.Plugins)){
    var SRP=C.registerPlugin?C.registerPlugin("SpeechRecognition"):C.Plugins.SpeechRecognition;
    var res=function(t,fin){var r=[{transcript:t}];r.isFinal=fin;return{resultIndex:0,results:[r]}};
    function NSR(){this.lang="en-US";this.continuous=true;this.interimResults=true;this._on=false;this._last=""}
    NSR.prototype.start=function(){var self=this;
      (async function(){
        try{
          var a=await SRP.available();if(!a||!a.available)throw{error:"service-not-allowed"};
          var p=await SRP.checkPermissions();if(p.speechRecognition!=="granted")p=await SRP.requestPermissions();
          if(p.speechRecognition!=="granted")throw{error:"not-allowed"};
          self._on=true;self._last="";
          self._h1=await SRP.addListener("partialResults",function(d){var t=(d&&d.matches&&d.matches[0])||"";if(!t)return;self._last=t;self.onresult&&self.onresult(res(t,false))});
          self._h2=await SRP.addListener("listeningState",function(d){if(d&&d.status==="stopped")self._finish()});
          SRP.start({language:self.lang,partialResults:true,popup:false,maxResults:1}).then(function(r){if(r&&r.matches&&r.matches[0]){self._last=r.matches[0];self._finish()}}).catch(function(){self._finish()});
        }catch(e){self.onerror&&self.onerror({error:(e&&e.error)||"service-not-allowed"});self.onend&&self.onend()}
      })()};
    NSR.prototype._finish=function(){if(!this._on)return;this._on=false;try{this._h1&&this._h1.remove();this._h2&&this._h2.remove()}catch(e){}
      var t=this._last;if(t&&this.onresult)this.onresult(res(t,true));this.onend&&this.onend()};
    NSR.prototype.stop=function(){try{SRP.stop()}catch(e){}this._finish()};
    NSR.prototype.abort=NSR.prototype.stop;
    window.SpeechRecognition=NSR;
  }
})();
