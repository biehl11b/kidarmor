// Adds permissions, app link scheme and settings to the generated iPhone and Android projects.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const which = process.argv[2];
function patchIOS() {
  const f = path.join(root, "ios/App/App/Info.plist"); let s = fs.readFileSync(f, "utf8");
  const add = (key, xml) => { if (!s.includes(`<key>${key}</key>`)) s = s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`); };
  const str = v => `<string>${v}</string>`;
  add("NSMicrophoneUsageDescription", str("KidArmor uses the microphone to record school meetings and to let you talk instead of type. Recordings stay on your phone."));
  add("NSSpeechRecognitionUsageDescription", str("KidArmor writes a transcript of what's said in your meetings and notes. If you choose Apple's speech service instead of On this phone only, the audio is sent to Apple to make the transcript."));
  add("NSFaceIDUsageDescription", str("Use Face ID to unlock your KidArmor records."));
  add("NSCalendarsUsageDescription", str("KidArmor adds school meetings you schedule to your calendar with your reminders."));
  add("NSCalendarsWriteOnlyAccessUsageDescription", str("KidArmor adds school meetings you schedule to your calendar with your reminders."));
  // The calendar plugin's code can also ask for full calendar and Reminders access. KidArmor never asks for them
  // (it only adds meetings through iOS's own "new event" screen), but Apple's upload check requires the text anyway.
  add("NSCalendarsFullAccessUsageDescription", str("KidArmor adds school meetings you schedule to your calendar with your reminders."));
  add("NSRemindersUsageDescription", str("KidArmor asks only if you choose to save a school follow-up as a reminder. It doesn't read your other reminders."));
  add("NSRemindersFullAccessUsageDescription", str("KidArmor asks only if you choose to save a school follow-up as a reminder. It doesn't read your other reminders."));
  add("NSCameraUsageDescription", str("Take pictures of report cards, documents and incidents to keep with your records."));
  add("NSPhotoLibraryUsageDescription", str("Choose photos and documents to keep with your records."));
  add("NSPhotoLibraryAddUsageDescription", str("Save files you choose to share from KidArmor."));
  add("ITSAppUsesNonExemptEncryption", "<false/>");
  add("CFBundleURLTypes", `<array><dict><key>CFBundleURLName</key><string>com.coastlinecode.kidarmor</string><key>CFBundleURLSchemes</key><array><string>kidarmor</string></array></dict></array>`);
  fs.writeFileSync(f, s); console.log("iOS Info.plist patched");
  // iPhone only (it still runs on iPad in iPhone mode). Avoids needing iPad screenshots and iPad review.
  const pbx = path.join(root, "ios/App/App.xcodeproj/project.pbxproj"); let p = fs.readFileSync(pbx, "utf8");
  p = p.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, "TARGETED_DEVICE_FAMILY = 1;"); fs.writeFileSync(pbx, p);
  // Privacy manifest (Apple requires one): no tracking, no data collected, and the system APIs the app's plugins use.
  fs.writeFileSync(path.join(root, "ios/App/App/PrivacyInfo.xcprivacy"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key><false/>
	<key>NSPrivacyTrackingDomains</key><array/>
	<key>NSPrivacyCollectedDataTypes</key><array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array></dict>
		<dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array></dict>
	</array>
</dict>
</plist>
`);
}
function patchAndroid() {
  const f = path.join(root, "android/app/src/main/AndroidManifest.xml"); let s = fs.readFileSync(f, "utf8");
  const perms = ["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "POST_NOTIFICATIONS", "USE_BIOMETRIC", "CAMERA", "WAKE_LOCK"];
  // Calendar events are added through the phone's own "new event" screen, which needs no calendar permission.
  if (!s.includes("xmlns:tools=")) s = s.replace("<manifest ", '<manifest xmlns:tools="http://schemas.android.com/tools" ');
  // Reminders are scheduled as inexact (isExactNotification:false), so drop the exact-alarm permission the
  // notifications plugin adds; Google Play only allows it for alarm-clock and calendar apps.
  const drop = ["READ_CALENDAR", "WRITE_CALENDAR", "SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM"].filter(p => !s.includes(`android.permission.${p}" tools:node="remove"`)).map(p => `    <uses-permission android:name="android.permission.${p}" tools:node="remove" />`).join("\n");
  const permXml = perms.filter(p => !s.includes(`android.permission.${p}"`)).map(p => `    <uses-permission android:name="android.permission.${p}" />`).join("\n");
  s = s.replace(/<\/manifest>\s*$/, `${permXml}\n${drop}\n    <queries>\n        <intent><action android:name="android.speech.RecognitionService" /></intent>\n    </queries>\n</manifest>\n`);
  if (!s.includes('android:scheme="kidarmor"')) s = s.replace("</intent-filter>", `</intent-filter>\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="kidarmor" />\n            </intent-filter>`);
  // Keep records out of Google cloud backups and phone-to-phone transfers (parents use KidArmor's own encrypted backup).
  s = s.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');
  if (!s.includes("android:allowBackup=")) s = s.replace("<application", '<application android:allowBackup="false"');
  if (!s.includes("android:dataExtractionRules=")) s = s.replace("<application", '<application android:dataExtractionRules="@xml/data_extraction_rules" android:fullBackupContent="false"');
  // Start the phone's web viewer before the first screen (see android-src/KidArmorApp.java)
  if (!s.includes('android:name=".KidArmorApp"')) s = s.replace("<application", '<application android:name=".KidArmorApp"');
  // Older phones (Android 7.0) lack some newer public root certificates, so the one-time speech download failed there.
  // Trust the phone's own list plus these well-known public roots (copied into res/raw below).
  if (!s.includes("android:networkSecurityConfig=")) s = s.replace("<application", '<application android:networkSecurityConfig="@xml/network_security_config"');
  const xmlDir = path.join(root, "android/app/src/main/res/xml"); fs.mkdirSync(xmlDir, { recursive: true });
  const rawDir = path.join(root, "android/app/src/main/res/raw"); fs.mkdirSync(rawDir, { recursive: true });
  const roots = fs.readdirSync(path.join(root, "android-src/roots")).filter(n => n.endsWith(".pem"));
  for (const n of roots) fs.copyFileSync(path.join(root, "android-src/roots", n), path.join(rawDir, "ka_root_" + n.replace(/\.pem$/, "")));
  fs.writeFileSync(path.join(xmlDir, "network_security_config.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false">\n    <trust-anchors>\n      <certificates src="system" />\n` + roots.map(n => `      <certificates src="@raw/ka_root_${n.replace(/\.pem$/, "")}" />\n`).join("") + `    </trust-anchors>\n  </base-config>\n</network-security-config>\n`);
  fs.writeFileSync(path.join(xmlDir, "data_extraction_rules.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup><exclude domain="root" path="." /><exclude domain="database" path="." /><exclude domain="sharedpref" path="." /><exclude domain="file" path="." /><exclude domain="external" path="." /></cloud-backup>\n  <device-transfer><exclude domain="root" path="." /><exclude domain="database" path="." /><exclude domain="sharedpref" path="." /><exclude domain="file" path="." /><exclude domain="external" path="." /></device-transfer>\n</data-extraction-rules>\n`);
  // Keep the screen running through any settings change (text size, dark mode, language, rotation, a second screen)
  // instead of restarting it; a restart during start-up can leave the page blank.
  const CFG = "orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|screenLayout|locale|layoutDirection|uiMode|navigation|density|fontScale|touchscreen|mcc|mnc|colorMode|fontWeightAdjustment|grammaticalGender";
  s = s.replace(/<activity\b[^>]*>/g, tag => {
    if (!/android:name="[^"]*MainActivity"/.test(tag)) return tag;
    return /android:configChanges=/.test(tag) ? tag.replace(/android:configChanges="[^"]*"/, `android:configChanges="${CFG}"`) : tag.replace("<activity", `<activity android:configChanges="${CFG}"`);
  });
  if (!s.includes(`android:configChanges="${CFG}"`)) throw new Error("Couldn't set configChanges on MainActivity");
  fs.writeFileSync(f, s); console.log("Android manifest patched");
  // KidArmor's own plugin: writes the meeting transcript from the saved recording (see android-src/)
  const javaDir = path.join(root, "android/app/src/main/java/com/coastlinecode/kidarmor");
  fs.copyFileSync(path.join(root, "android-src/KaTranscribePlugin.java"), path.join(javaDir, "KaTranscribePlugin.java"));
  fs.copyFileSync(path.join(root, "android-src/KidArmorApp.java"), path.join(javaDir, "KidArmorApp.java"));
  // KidArmor's own screen: registers the speech plugin, logs start-up, and reloads the page if it ever comes up blank
  fs.copyFileSync(path.join(root, "android-src/MainActivity.java"), path.join(javaDir, "MainActivity.java"));
  console.log("KaTranscribe plugin added");
  // KidArmor's own speech engine (Vosk). These versions are built for 16 KB memory pages (Google Play requires it).
  const bg = path.join(root, "android/app/build.gradle"); let g = fs.readFileSync(bg, "utf8");
  if (!g.includes("vosk-android")) {
    g = g.replace(/dependencies\s*\{/, "dependencies {\n    implementation 'net.java.dev.jna:jna:5.19.1@aar'\n    implementation 'com.alphacephei:vosk-android:0.3.75@aar'");
    if (!g.includes("vosk-android")) throw new Error("Couldn't add the speech engine to app/build.gradle");
    fs.writeFileSync(bg, g);
  }
  console.log("Speech engine added");
}
if (which === "ios" || which === "all") patchIOS();
if (which === "android" || which === "all") patchAndroid();
