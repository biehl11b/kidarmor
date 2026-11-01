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
cd android && chmod +x gradlew
# Each build gets a higher version number (Google Play requires this)
VC=$((100 + ${GITHUB_RUN_NUMBER:-1}))
sed -i "s/versionCode [0-9]\+/versionCode $VC/" app/build.gradle
grep -n "versionCode\|versionName" app/build.gradle || true
./gradlew assembleDebug --no-daemon --stacktrace
mkdir -p ../out && cp app/build/outputs/apk/debug/app-debug.apk ../out/KidArmor-test.apk
# Signed store bundle, only when the signing key is set up in GitHub secrets
if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  set +x
  echo "$ANDROID_KEYSTORE_B64" | base64 -d > "$PWD/upload.jks"
  ./gradlew bundleRelease --no-daemon --stacktrace \
    -Pandroid.injected.signing.store.file="$PWD/upload.jks" \
    -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
    -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$ANDROID_KEYSTORE_PASSWORD"
  rm -f "$PWD/upload.jks"
  set -x
  cp app/build/outputs/bundle/release/app-release.aab ../out/KidArmor-store.aab
else
  echo "No signing key in secrets yet; skipping store bundle"
fi
ls -la ../out
