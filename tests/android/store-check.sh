#!/usr/bin/env bash
# Installs the Google Play bundle (KidArmor-store.aab) on a virtual phone exactly the way Google Play does:
# bundletool picks the pieces (split APKs) this phone would get from Play, then installs them.
set -x
OUT=${OUT:-store}; mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 90); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 10
KS=$HOME/.android/debug.keystore
mkdir -p "$HOME/.android"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -alias androiddebugkey -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
java -jar bundletool.jar build-apks --bundle=KidArmor-store.aab --output=ka.apks --connected-device --overwrite \
  --ks="$KS" --ks-pass=pass:android --ks-key-alias=androiddebugkey --key-pass=pass:android 2>&1 | tee "$OUT/build-apks.txt"
unzip -l ka.apks > "$OUT/pieces-from-play.txt" 2>&1
java -jar bundletool.jar install-apks --apks=ka.apks 2>&1 | tee "$OUT/install.txt"
adb shell pm list packages | grep -q com.coastlinecode.kidarmor && echo "installed" >> "$OUT/install.txt" || echo "NOT INSTALLED" >> "$OUT/install.txt"
adb logcat -G 16M || true
OUT=$OUT python3 tests/android/store-check.py 2>&1 | tee "$OUT/run.txt"
