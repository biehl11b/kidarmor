#!/usr/bin/env bash
# Runs every KidArmor test against native/src/app.html. Needs Node and Playwright (with Chromium).
cd "$(dirname "$0")"
pass=0; fail=0; failed=()
for t in test_*.js; do
  out=$(timeout 600 node "$t" 2>&1); code=$?
  if [ $code -ne 0 ] || grep -q "FAIL" <<<"$out"; then fail=$((fail+1)); failed+=("$t"); echo "✗ $t"; grep "FAIL" <<<"$out" | head -5 | sed 's/^/    /'
  else pass=$((pass+1)); echo "✓ $t ($(grep -c '  ok' <<<"$out") checks)"; fi
done
echo; echo "$pass passed, $fail failed"; [ $fail -eq 0 ]
