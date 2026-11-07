#!/usr/bin/env bash
# Builds the signed Google Play bundle. Runs as its own step so the signing key
# is never present while packages are being downloaded and installed.
set -euo pipefail
if [ -z "${ANDROID_KEYSTORE_B64:-}" ]; then echo "No signing key in secrets yet; skipping store bundle"; exit 0; fi
cd android
KS="$RUNNER_TEMP/upload.jks"
trap 'rm -f "$KS"' EXIT
echo "$ANDROID_KEYSTORE_B64" | base64 -d > "$KS"
./gradlew bundleRelease --no-daemon --stacktrace \
  -Pandroid.injected.signing.store.file="$KS" \
  -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$ANDROID_KEYSTORE_PASSWORD"
cp app/build/outputs/bundle/release/app-release.aab ../out/KidArmor-store.aab
ls -la ../out
