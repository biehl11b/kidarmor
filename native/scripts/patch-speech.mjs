// Adds an "onDevice" option to the speech plugin, so a parent can choose transcripts made only on the phone.
// iPhone: requiresOnDeviceRecognition. Android 13+: the on-device recognizer. If the phone can't, the plugin
// rejects with "on-device-unavailable" and KidArmor records without a live transcript.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "node_modules/@capacitor-community/speech-recognition");
function patch(rel, steps) {
  const f = path.join(root, rel); let s = fs.readFileSync(f, "utf8");
  if (s.includes("KIDARMOR_ONDEVICE")) { console.log("already patched:", rel); return }
  for (const [a, b] of steps) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`speech patch: anchor found ${n} times in ${rel}: ${a.slice(0, 70)}`); s = s.replace(a, b) }
  fs.writeFileSync(f, s); console.log("patched:", rel);
}
patch("ios/Plugin/Plugin.swift", [
  [`let partialResults: Bool = call.getBool("partialResults") ?? false`,
   `let partialResults: Bool = call.getBool("partialResults") ?? false
            let onDevice: Bool = call.getBool("onDevice") ?? false // KIDARMOR_ONDEVICE`],
  [`self.speechRecognizer = SFSpeechRecognizer.init(locale: Locale(identifier: language))`,
   `self.speechRecognizer = SFSpeechRecognizer.init(locale: Locale(identifier: language))
            if onDevice && !(self.speechRecognizer?.supportsOnDeviceRecognition ?? false) {
                call.reject("on-device-unavailable")
                return
            }`],
  [`self.recognitionRequest?.shouldReportPartialResults = partialResults`,
   `self.recognitionRequest?.shouldReportPartialResults = partialResults
            if onDevice { self.recognitionRequest?.requiresOnDeviceRecognition = true }`],
]);
patch("android/src/main/java/com/getcapacitor/community/speechrecognition/SpeechRecognition.java", [
  [`    private boolean listening = false;`,
   `    private boolean listening = false;
    private boolean onDeviceOnly = false; // KIDARMOR_ONDEVICE`],
  [`        boolean popup = call.getBoolean("popup", false);
        beginListening(`,
   `        boolean popup = call.getBoolean("popup", false);
        onDeviceOnly = call.getBoolean("onDevice", false);
        beginListening(`],
  [`        intent.putExtra("android.speech.extra.DICTATION_MODE", partialResults);`,
   `        intent.putExtra("android.speech.extra.DICTATION_MODE", partialResults);
        if (onDeviceOnly) intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);`],
  [`                            speechRecognizer = null;
                        }

                        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(bridge.getActivity());`,
   `                            speechRecognizer = null;
                        }

                        if (onDeviceOnly) {
                            if (android.os.Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(bridge.getActivity())) {
                                speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(bridge.getActivity());
                            } else {
                                call.reject("on-device-unavailable");
                                return;
                            }
                        } else {
                            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(bridge.getActivity());
                        }`],
]);
