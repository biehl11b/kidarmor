#!/usr/bin/env bash
# Runs the Android test app on a virtual phone and saves a screenshot and the app's console messages.
set -x
mkdir -p emu
adb install -r out/KidArmor-test.apk
adb logcat -c
adb shell am start -n com.coastlinecode.kidarmor/.MainActivity
sleep 25
adb exec-out screencap -p > emu/1-first-open.png
adb shell input tap 540 1200; sleep 2
adb logcat -d > emu/logcat-full.txt
grep -E "Capacitor|chromium|Console|KidArmor|AndroidRuntime|FATAL" emu/logcat-full.txt > emu/app-log.txt || true
grep -ciE "Uncaught|TypeError|ReferenceError|FATAL EXCEPTION" emu/app-log.txt > emu/error-count.txt || true
grep -o "KA_NATIVE_OK.*" emu/logcat-full.txt > emu/native-ok.txt || echo "NO NATIVE OK LINE" > emu/native-ok.txt
adb shell pidof com.coastlinecode.kidarmor > emu/running.txt || echo "NOT RUNNING" > emu/running.txt
ls -la emu
