#!/usr/bin/env bash
set -euxo pipefail
node -v; xcodebuild -version
npm install --no-audit --no-fund --legacy-peer-deps $(cat plugins.txt)
npm ls --depth=0 || true
node scripts/prepare-www.mjs
[ -d ios ] || npx cap add ios
node scripts/patch-native.mjs ios
npx capacitor-assets generate --ios --iconBackgroundColor '#1f5d70' --splashBackgroundColor '#1f5d70' --splashBackgroundColorDark '#13232b' || echo "ICON STEP FAILED (using defaults)"
npx cap sync ios
cd ios/App
if [ -d App.xcworkspace ]; then T=(-workspace App.xcworkspace); else T=(-project App.xcodeproj); fi
xcodebuild "${T[@]}" -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet build
echo "IOS SIMULATOR BUILD OK"
