#!/usr/bin/env bash
# Checks the App Store (Release) build of KidArmor for things App Review or the upload checks reject.
# Usage: store-audit.sh <path to App.app> <ios project dir> <out dir>
APP=$1; PROJ=$2; OUT=$3; mkdir -p "$OUT"; R="$OUT/audit.txt"; : > "$R"
ok(){ echo "ok   $1${2:+  → $2}" | tee -a "$R"; }; bad(){ echo "FAIL $1${2:+  → $2}" | tee -a "$R"; }; info(){ echo "info $1${2:+  → $2}" | tee -a "$R"; }
PL="$APP/Info.plist"; pb(){ /usr/libexec/PlistBuddy -c "Print :$1" "$PL" 2>/dev/null; }
plutil -convert xml1 -o "$OUT/Info.plist.xml" "$PL"
info "version" "$(pb CFBundleShortVersionString) ($(pb CFBundleVersion)), min iOS $(pb MinimumOSVersion), devices $(pb UIDeviceFamily | tr -d '\n ')"
# 1. permission purpose strings for every protected thing the app's code can ask for
BIN="$APP/$(pb CFBundleExecutable)"; ALL=$(find "$APP" -type f \( -perm -111 -o -name '*.dylib' \) 2>/dev/null)
syms=$(for f in $ALL; do nm -u "$f" 2>/dev/null; strings -a "$f" 2>/dev/null; done | sort -u)
need(){ # need <plist key> <regex of APIs that require it> <what>
  if echo "$syms" | grep -qE "$2"; then if [ -n "$(pb "$1")" ]; then ok "purpose text for $3 ($1)"; else bad "purpose text for $3 ($1) missing, but the app's code uses it" "$(echo "$syms" | grep -oE "$2" | sort -u | head -3 | tr '\n' ' ')"; fi
  else [ -n "$(pb "$1")" ] && info "$1 present (app code doesn't seem to use it)"; fi; }
need NSMicrophoneUsageDescription "AVAudioSession|requestRecordPermission|AVCaptureDevice" "microphone"
need NSCameraUsageDescription "AVCaptureDevice|UIImagePickerController" "camera"
need NSPhotoLibraryUsageDescription "PHPhotoLibrary|PHPicker|UIImagePickerController" "photos"
need NSSpeechRecognitionUsageDescription "SFSpeechRecognizer" "speech recognition"
need NSFaceIDUsageDescription "LAContext|evaluatePolicy" "Face ID"
need NSCalendarsUsageDescription "requestAccessToEntityType|requestFullAccessToEvents|requestWriteOnlyAccessToEvents" "calendar (older iOS)"
need NSCalendarsFullAccessUsageDescription "requestFullAccessToEvents" "calendar full access"
need NSCalendarsWriteOnlyAccessUsageDescription "requestWriteOnlyAccessToEvents" "calendar add-only"
need NSRemindersUsageDescription "EKEntityTypeReminder|requestAccessToEntityType.*[Rr]eminder|fetchRemindersMatchingPredicate|EKReminder" "reminders (older iOS)"
need NSRemindersFullAccessUsageDescription "requestFullAccessToReminders" "reminders"
need NSContactsUsageDescription "CNContactStore" "contacts"
need NSLocationWhenInUseUsageDescription "CLLocationManager|requestWhenInUseAuthorization" "location"
need NSUserTrackingUsageDescription "ATTrackingManager" "tracking"
need NSBluetoothAlwaysUsageDescription "CBCentralManager" "Bluetooth"
need NSMotionUsageDescription "CMMotionActivityManager" "motion"
# 2. settings that commonly get apps rejected
[ -z "$(pb UIBackgroundModes)" ] && ok "no background modes (none are used)" || bad "background modes declared" "$(pb UIBackgroundModes | tr '\n' ' ')"
info "export compliance key ITSAppUsesNonExemptEncryption" "$(pb ITSAppUsesNonExemptEncryption || echo missing)"
[ "$(pb UIRequiresFullScreen)" = "true" ] && info "UIRequiresFullScreen true" || info "UIRequiresFullScreen not set (iPad multitasking sizes must work)"
info "orientations iPhone" "$(pb UISupportedInterfaceOrientations | tr -d '\n' | tr -s ' ')"
info "orientations iPad" "$(pb UISupportedInterfaceOrientations~ipad | tr -d '\n' | tr -s ' ')"
[ -n "$(pb UILaunchStoryboardName)" ] && ok "launch screen" "$(pb UILaunchStoryboardName)" || bad "no launch screen storyboard"
# 3. privacy manifests and the "required reason" APIs Apple checks at upload (ITMS-91053)
find "$APP" -name '*.xcprivacy' > "$OUT/privacy-manifests.txt"; info "privacy manifests in the app" "$(wc -l < "$OUT/privacy-manifests.txt" | tr -d ' ')"
[ -f "$APP/PrivacyInfo.xcprivacy" ] && ok "app's own privacy manifest is inside the app" || bad "app's own privacy manifest missing from the app"
declared=$(cat $(cat "$OUT/privacy-manifests.txt") 2>/dev/null | tr -d '\n\t ' )
api(){ # api <category> <regex>
  if echo "$syms" | grep -qE "$2"; then echo "$declared" | grep -q "$1" && ok "required-reason API declared: $1" || bad "required-reason API used but not declared in any privacy manifest: $1" "$(echo "$syms" | grep -oE "$2" | sort -u | head -3 | tr '\n' ' ')"; fi; }
api NSPrivacyAccessedAPICategoryFileTimestamp "NSFileCreationDate|NSFileModificationDate|creationDate|contentModificationDate|getattrlist|_stat\$|_fstat\$|_lstat\$"
api NSPrivacyAccessedAPICategorySystemBootTime "systemUptime|mach_absolute_time"
api NSPrivacyAccessedAPICategoryDiskSpace "volumeAvailableCapacity|NSFileSystemFreeSize|NSFileSystemSize|statfs|statvfs"
api NSPrivacyAccessedAPICategoryUserDefaults "NSUserDefaults|UserDefaults"
api NSPrivacyAccessedAPICategoryActiveKeyboards "activeInputModes"
# 4. the app icon: Apple rejects a 1024 icon with transparency (ITMS-90717)
ICON=$(find "$PROJ" -path '*AppIcon.appiconset*' -name '*.png' | xargs -I{} sh -c 'echo "$(sips -g pixelWidth "{}" | awk "/pixelWidth/{print \$2}") {}"' | sort -n | tail -1 | cut -d' ' -f2-)
if [ -n "$ICON" ]; then a=$(sips -g hasAlpha "$ICON" | awk '/hasAlpha/{print $2}'); w=$(sips -g pixelWidth "$ICON" | awk '/pixelWidth/{print $2}'); cp "$ICON" "$OUT/app-icon.png"
  [ "$a" = "no" ] && ok "app icon ${w}px has no transparency" || bad "app icon has transparency (Apple rejects it)" "$ICON"; else bad "no app icon found"; fi
[ -f "$APP/Assets.car" ] && ok "compiled icons/images (Assets.car)" || bad "Assets.car missing"
# 5. the web part is the store version, not the test version
WWW="$APP/public"; [ -d "$WWW" ] || WWW=$(dirname "$(find "$APP" -name index.html | head -1)")
grep -q "ka-test.js" "$WWW/index.html" && bad "test helper is in the store build" || ok "no test helper in the store build"
grep -q "'unsafe-eval'" "$WWW/index.html" && bad "unsafe-eval in the store build" || ok "no unsafe-eval in the store build"
grep -q '"webContentsDebuggingEnabled": *true' "$APP/capacitor.config.json" 2>/dev/null && bad "web inspector turned on in the store build" || ok "web inspector off in the store build"
cp "$APP/capacitor.config.json" "$OUT/" 2>/dev/null
info "app size" "$(du -sh "$APP" | cut -f1)"
