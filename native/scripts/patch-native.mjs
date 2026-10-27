// Adds permissions, app link scheme and settings to the generated iPhone and Android projects.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const which = process.argv[2];
function patchIOS() {
  const f = path.join(root, "ios/App/App/Info.plist"); let s = fs.readFileSync(f, "utf8");
  const add = (key, xml) => { if (!s.includes(`<key>${key}</key>`)) s = s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`); };
  const str = v => `<string>${v}</string>`;
  add("NSMicrophoneUsageDescription", str("KidArmor uses the microphone to record school meetings and to let you talk instead of type. Recordings stay on your phone."));
  add("NSSpeechRecognitionUsageDescription", str("KidArmor writes a transcript of what's said in your meetings and notes, so you can read and search it later."));
  add("NSFaceIDUsageDescription", str("Use Face ID to unlock your KidArmor records."));
  add("NSCalendarsUsageDescription", str("KidArmor adds school meetings you schedule to your calendar with your reminders."));
  add("NSCalendarsWriteOnlyAccessUsageDescription", str("KidArmor adds school meetings you schedule to your calendar with your reminders."));
  add("NSCalendarsFullAccessUsageDescription", str("KidArmor adds school meetings you schedule to your calendar with your reminders."));
  add("NSCameraUsageDescription", str("Take pictures of report cards, documents and incidents to keep with your records."));
  add("NSPhotoLibraryUsageDescription", str("Choose photos and documents to keep with your records."));
  add("NSPhotoLibraryAddUsageDescription", str("Save files you choose to share from KidArmor."));
  add("ITSAppUsesNonExemptEncryption", "<false/>");
  add("CFBundleURLTypes", `<array><dict><key>CFBundleURLName</key><string>com.coastlinecode.kidarmor</string><key>CFBundleURLSchemes</key><array><string>kidarmor</string></array></dict></array>`);
  fs.writeFileSync(f, s); console.log("iOS Info.plist patched");
}
function patchAndroid() {
  const f = path.join(root, "android/app/src/main/AndroidManifest.xml"); let s = fs.readFileSync(f, "utf8");
  const perms = ["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "POST_NOTIFICATIONS", "READ_CALENDAR", "WRITE_CALENDAR", "USE_BIOMETRIC", "CAMERA", "WAKE_LOCK"];
  const permXml = perms.filter(p => !s.includes(`android.permission.${p}"`)).map(p => `    <uses-permission android:name="android.permission.${p}" />`).join("\n");
  s = s.replace(/<\/manifest>\s*$/, `${permXml}\n    <queries>\n        <intent><action android:name="android.speech.RecognitionService" /></intent>\n    </queries>\n</manifest>\n`);
  if (!s.includes('android:scheme="kidarmor"')) s = s.replace("</intent-filter>", `</intent-filter>\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="kidarmor" />\n            </intent-filter>`);
  fs.writeFileSync(f, s); console.log("Android manifest patched");
}
if (which === "ios" || which === "all") patchIOS();
if (which === "android" || which === "all") patchAndroid();
