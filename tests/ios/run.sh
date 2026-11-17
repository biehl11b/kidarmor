#!/usr/bin/env bash
# Runs on a Mac: builds the test app once, then walks through it on several virtual iPhones.
set -x
OUT=${OUT:-sim}; mkdir -p "$OUT"
ROOT=$PWD
( cd native && KA_TEST=1 KA_DERIVED="$ROOT/dd" bash scripts/ci-ios.sh ) > "$OUT/build.txt" 2>&1 || { tail -60 "$OUT/build.txt"; echo "BUILD FAILED" > "$OUT/summary.txt"; exit 0; }
tail -3 "$OUT/build.txt"
APP=$(find "$ROOT/dd/Build/Products" -maxdepth 2 -name App.app -type d | head -1); echo "app: $APP"
xcrun simctl list runtimes | tee "$OUT/runtimes.txt"
npm i -g appium@3 >/dev/null 2>&1 && appium driver install xcuitest 2>&1 | tail -2
( cd tests/ios && npm init -y >/dev/null && npm i --no-audit --no-fund webdriverio@9 >/dev/null 2>&1 ) && echo "webdriverio ready"
# Build the iPhone driver (WebDriverAgent) once up front, so each phone's test starts quickly
WDA=$(find ~/.appium -name WebDriverAgent.xcodeproj -maxdepth 6 | head -1); echo "WDA: $WDA"
xcodebuild build-for-testing -project "$WDA" -scheme WebDriverAgentRunner -destination 'generic/platform=iOS Simulator' -derivedDataPath "$ROOT/wda" CODE_SIGNING_ALLOWED=NO -quiet > "$OUT/wda-build.txt" 2>&1 && echo "WDA BUILD OK" || tail -30 "$OUT/wda-build.txt"
export WDA_DD="$ROOT/wda"
appium --session-override --log-level warn --log "$OUT/appium.txt" > /dev/null 2>&1 &
sleep 8
# Which iPhones: the newest iOS on every phone size, plus the oldest iOS this Mac has
NEW=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys;r=[x for x in json.load(sys.stdin)["runtimes"] if x["platform"]=="iOS" and x["isAvailable"]];r.sort(key=lambda x:[int(p) for p in x["version"].split(".")]);print(r[-1]["identifier"],r[0]["identifier"])')
read RT_NEW RT_OLD <<< "$NEW"
pick() { xcrun simctl list devicetypes -j | python3 -c "import json,sys,re;t=[x for x in json.load(sys.stdin)['devicetypes'] if re.search(r'$1',x['name'])];print(t[-1]['identifier'] if t else '')"; }
PLAN="SE|iPhone SE|$RT_NEW
Standard|^iPhone 1[6-9]\$|$RT_NEW
ProMax|^iPhone 1[6-9] Pro Max\$|$RT_NEW
Air|^iPhone (Air|1[6-9] Plus)\$|$RT_NEW"
[ "$RT_OLD" != "$RT_NEW" ] && PLAN="$PLAN
Older iOS|^iPhone 1[5-6]\$|$RT_OLD"
[ -n "${DEVICES:-}" ] && PLAN=$(echo "$PLAN" | grep -E "^(${DEVICES//,/|})\|")
echo "$PLAN" | while IFS='|' read -r LABEL PAT RT; do
  DT=$(pick "$PAT"); [ -z "$DT" ] && { echo "no device type for $LABEL"; continue; }
  NAME=$(xcrun simctl list devicetypes -j | python3 -c "import json,sys;print([x['name'] for x in json.load(sys.stdin)['devicetypes'] if x['identifier']=='$DT'][0])")
  UDID=$(xcrun simctl create "KA $LABEL" "$DT" "$RT") || { echo "can't make $NAME on $RT"; continue; }
  xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" -b > /dev/null
  for s in calendar reminders photos microphone; do xcrun simctl privacy "$UDID" grant $s com.coastlinecode.kidarmor 2>/dev/null; done
  D="$OUT/$(echo "$LABEL" | tr ' ' '-')"; mkdir -p "$D"
  IOSVER=$(echo "$RT" | sed -E "s/.*iOS-//; s/-/./g") UDID=$UDID APP=$APP DEVICE="$NAME" OUT=$D perl -e "alarm 2400; exec @ARGV" node tests/ios/drive.mjs 2>&1 | tee "$D/run.txt"
  xcrun simctl shutdown "$UDID"; xcrun simctl delete "$UDID"
done
cat "$OUT"/*/summary.txt > "$OUT/summary.txt" 2>/dev/null
cat "$OUT/summary.txt"
