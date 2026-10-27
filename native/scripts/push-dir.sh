#!/usr/bin/env bash
# Saves a folder of results to a ci-<name> branch so it can be read back.
name=$1; dir=$2
cd "$RUNNER_TEMP" && rm -rf res && mkdir res && cd res && git init -q && git checkout -q -b "ci-$name"
cp -r "$GITHUB_WORKSPACE/$dir/." . 2>/dev/null || echo "no results" > none.txt
echo "$GITHUB_SHA $(date -u)" > info.txt
git add -A && git -c user.name=ci -c user.email=ci@users.noreply.github.com commit -qm "results $GITHUB_SHA"
git push -q -f "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}" "ci-$name"
