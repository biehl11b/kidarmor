#!/usr/bin/env bash
set -euxo pipefail
# Apple requires apps uploaded from April 28, 2026 to be built with Xcode 26 or later.
XC=$(ls -d /Applications/Xcode_26*.app 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$XC" ]; then sudo xcode-select -s "$XC"; fi
node -v; xcodebuild -version
XV=$(xcodebuild -version | head -1 | awk '{print $2}' | cut -d. -f1)
if [ "$XV" -lt 26 ]; then echo "Xcode $XV is too old for the App Store (needs 26 or later)"; exit 1; fi
npm install --no-audit --no-fund --legacy-peer-deps $(cat plugins.txt)
npm ls --depth=0 || true
node scripts/patch-speech.mjs
node scripts/prepare-www.mjs
[ -d ios ] || npx cap add ios
node scripts/patch-native.mjs ios
# Add the privacy manifest to the Xcode project so it ships inside the app
gem install --user-install xcodeproj --no-document >/dev/null 2>&1 || gem install xcodeproj --no-document
export PATH="$(ruby -e 'print Gem.user_dir')/bin:$PATH"
ruby -e '
  require "xcodeproj"
  p = Xcodeproj::Project.open("ios/App/App.xcodeproj")
  t = p.targets.find { |x| x.name == "App" }
  g = p.main_group["App"]
  unless g.files.any? { |f| f.path == "PrivacyInfo.xcprivacy" }
    ref = g.new_reference("PrivacyInfo.xcprivacy")
    t.resources_build_phase.add_file_reference(ref)
    p.save
    puts "Privacy manifest added to the app"
  else
    puts "Privacy manifest already in the app"
  end'
npx capacitor-assets generate --ios --iconBackgroundColor '#e19a12' --splashBackgroundColor '#1f5d70' --splashBackgroundColorDark '#13232b' || echo "ICON STEP FAILED (using defaults)"
npx cap sync ios
cd ios/App
if [ -d App.xcworkspace ]; then T=(-workspace App.xcworkspace); else T=(-project App.xcodeproj); fi
echo "${T[@]}" > ../../.xcode-target
grep -n "TARGETED_DEVICE_FAMILY\|IPHONEOS_DEPLOYMENT_TARGET" App.xcodeproj/project.pbxproj | sort -u | head -6 || true
xcodebuild "${T[@]}" -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet build
echo "IOS SIMULATOR BUILD OK"
