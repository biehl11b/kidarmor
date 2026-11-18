#!/usr/bin/env bash
# Runs on a Mac: builds the App Store (Release) version of KidArmor for the simulator, checks it for things
# App Review rejects, then opens it on an iPhone, an iPad and an iPhone on the oldest iOS this Mac has.
set -x
OUT=${OUT:-store}; mkdir -p "$OUT"; ROOT=$PWD
( cd native && KA_DERIVED="$ROOT/dd" bash scripts/ci-ios.sh ) > "$OUT/build.txt" 2>&1 || { tail -60 "$OUT/build.txt"; echo "BUILD FAILED" > "$OUT/summary.txt"; exit 0; }
read -r -a T < native/.xcode-target
( cd native/ios/App && xcodebuild "${T[@]}" -scheme App -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -derivedDataPath "$ROOT/ddr" -quiet build ) > "$OUT/build-release.txt" 2>&1 \
  && echo "RELEASE SIM BUILD OK" || { tail -40 "$OUT/build-release.txt"; echo "RELEASE BUILD FAILED" > "$OUT/summary.txt"; exit 0; }
APP=$(find "$ROOT/ddr/Build/Products" -maxdepth 2 -name App.app -type d | grep -i release | head -1); echo "app: $APP"
bash tests/ios/store-audit.sh "$APP" native/ios/App "$OUT/audit"
xcrun simctl list runtimes > "$OUT/runtimes.txt"
( cd tests/ios && npm init -y >/dev/null && npm i --no-audit --no-fund webdriverio@9 >/dev/null 2>&1 ) && echo "webdriverio ready"
npm i -g appium@3 >/dev/null 2>&1 && appium driver install xcuitest 2>&1 | tail -2
WDA=$(find ~/.appium -name WebDriverAgent.xcodeproj -maxdepth 6 | head -1)
xcodebuild build-for-testing -project "$WDA" -scheme WebDriverAgentRunner -destination 'generic/platform=iOS Simulator' -derivedDataPath "$ROOT/wda" CODE_SIGNING_ALLOWED=NO -quiet > "$OUT/wda-build.txt" 2>&1 && echo "WDA BUILD OK" || tail -30 "$OUT/wda-build.txt"
export WDA_DD="$ROOT/wda"
appium --session-override --log-level warn --log "$OUT/appium.txt" > /dev/null 2>&1 &
sleep 8
NEW=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys;r=[x for x in json.load(sys.stdin)["runtimes"] if x["platform"]=="iOS" and x["isAvailable"]];r.sort(key=lambda x:[int(p) for p in x["version"].split(".")]);print(r[-1]["identifier"],r[0]["identifier"])')
read RT_NEW RT_OLD <<< "$NEW"
pick() { xcrun simctl list runtimes -j | python3 -c "import json,sys,re;r=[x for x in json.load(sys.stdin)['runtimes'] if x['identifier']=='$2'][0];t=[x for x in r.get('supportedDeviceTypes',[]) if re.search(r'$1',x['name'])];print(t[-1]['identifier'] if t else '')"; }
PLAN="iPhone;^iPhone 1[6-9]\$;$RT_NEW
iPad;^iPad (Pro 13|Air 13|Pro \\(12\\.9|\\(A16|\\(10th);$RT_NEW"
[ "$RT_OLD" != "$RT_NEW" ] && PLAN="$PLAN
Older-iOS;^iPhone 1[4-6]\$;$RT_OLD"
[ -n "${DEVICES:-}" ] && PLAN=$(echo "$PLAN" | grep -E "^(${DEVICES//,/|});")
echo "$PLAN" | while IFS=';' read -r LABEL PAT RT; do
  DT=$(pick "$PAT" "$RT"); [ -z "$DT" ] && { echo "no device type for $LABEL" | tee -a "$OUT/missing.txt"; continue; }
  NAME=$(xcrun simctl list devicetypes -j | python3 -c "import json,sys;print([x['name'] for x in json.load(sys.stdin)['devicetypes'] if x['identifier']=='$DT'][0])")
  UDID=$(xcrun simctl create "KA $LABEL" "$DT" "$RT") || continue
  xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" -b > /dev/null
  D="$OUT/$LABEL"; mkdir -p "$D"
  IOSVER=$(echo "$RT" | sed -E "s/.*iOS-//; s/-/./g") UDID=$UDID APP=$APP DEVICE="$NAME" OUT=$D perl -e "alarm 2400; exec @ARGV" node tests/ios/store-check.mjs 2>&1 | tee "$D/run.txt"
  xcrun simctl shutdown "$UDID"; xcrun simctl delete "$UDID"
done
{ echo "== App Store build checks"; cat "$OUT/audit/audit.txt"; for f in "$OUT"/*/summary.txt; do echo "== $f"; cat "$f"; done; cat "$OUT/missing.txt" 2>/dev/null; } > "$OUT/summary.txt"
cat "$OUT/summary.txt"
