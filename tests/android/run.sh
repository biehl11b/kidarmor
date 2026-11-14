#!/usr/bin/env bash
# Runs inside the virtual Android phone job. Installs the test app and runs the walkthrough.
set -x
OUT=${OUT:-emu}; mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
adb install -r -g KidArmor-test.apk 2>&1 | tee "$OUT/install.txt" || adb install -r KidArmor-test.apk
# -g pre-grants permissions; take them back so the real permission prompts are tested
for p in RECORD_AUDIO POST_NOTIFICATIONS CAMERA; do adb shell pm revoke com.coastlinecode.kidarmor android.permission.$p 2>/dev/null; done
adb logcat -c
OUT=$OUT node tests/android/drive.mjs 2>&1 | tee "$OUT/run.txt"
