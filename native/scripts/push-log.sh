#!/usr/bin/env bash
# Saves a build log to a ci-<name> branch so it can be read back.
name=$1; log=$2
cd "$RUNNER_TEMP" && rm -rf logs && mkdir logs && cd logs && git init -q && git checkout -q -b "ci-$name"
cp "$GITHUB_WORKSPACE/$log" build.log 2>/dev/null || echo "no log" > build.log
tail -c 400000 build.log > b && mv b build.log
echo "$GITHUB_SHA $(date -u) status=$3" > info.txt
git add -A && git -c user.name=ci -c user.email=ci@users.noreply.github.com commit -qm "log $GITHUB_SHA"
git push -q -f "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}" "ci-$name"
