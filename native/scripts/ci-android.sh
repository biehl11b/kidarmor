#!/usr/bin/env bash
set -euxo pipefail
node -v; java -version
npm install --no-audit --no-fund --legacy-peer-deps $(cat plugins.txt)
npm ls --depth=0 || true
node scripts/prepare-www.mjs
[ -d android ] || npx cap add android
node scripts/patch-native.mjs android
npx capacitor-assets generate --android --iconBackgroundColor '#1f5d70' --iconBackgroundColorDark '#1f5d70' --splashBackgroundColor '#1f5d70' --splashBackgroundColorDark '#13232b' || echo "ICON STEP FAILED (using defaults)"
npx cap sync android
cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon --stacktrace
mkdir -p ../out && cp app/build/outputs/apk/debug/app-debug.apk ../out/KidArmor-test.apk
ls -la ../out
