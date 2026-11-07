#!/usr/bin/env bash
set -euxo pipefail
node -v; java -version
npm install --no-audit --no-fund --legacy-peer-deps $(cat plugins.txt)
npm ls --depth=0 || true
node scripts/patch-speech.mjs
node scripts/prepare-www.mjs
[ -d android ] || npx cap add android
node scripts/patch-native.mjs android
npx capacitor-assets generate --android --iconBackgroundColor '#e19a12' --iconBackgroundColorDark '#e19a12' --splashBackgroundColor '#1f5d70' --splashBackgroundColorDark '#13232b' || echo "ICON STEP FAILED (using defaults)"
npx cap sync android
cd android && chmod +x gradlew
# Google Play requires target API level 36 (Android 16) for new apps from August 31, 2026
grep -n "compileSdkVersion\|targetSdkVersion\|minSdkVersion" variables.gradle || true
TS=$(grep -o "targetSdkVersion *= *[0-9]*" variables.gradle | grep -o "[0-9]*$")
if [ "${TS:-0}" -lt 36 ]; then sed -i "s/targetSdkVersion *= *[0-9]*/targetSdkVersion = 36/; s/compileSdkVersion *= *[0-9]*/compileSdkVersion = 36/" variables.gradle; echo "Raised target SDK to 36"; fi
# Each build gets a higher version number (Google Play requires this)
VC=$((100 + ${GITHUB_RUN_NUMBER:-1}))
VN=$(node -p "require('../package.json').version")
sed -i "s/versionCode [0-9]\+/versionCode $VC/; s/versionName \"[^\"]*\"/versionName \"$VN\"/" app/build.gradle
grep -n "versionCode\|versionName" app/build.gradle || true
./gradlew assembleDebug --no-daemon --stacktrace
mkdir -p ../out && cp app/build/outputs/apk/debug/app-debug.apk ../out/KidArmor-test.apk
ls -la ../out
