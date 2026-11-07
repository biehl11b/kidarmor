#!/bin/sh
# Rebuilds index.html (minified) from the KidArmor page.
cd "$(dirname "$0")"
# The app source lives in native/src/app.html (the same file the phone apps are built from).
SRC=../native/src/app.html
node minify.js "$SRC" body.min.html || exit 1
{ printf '%s' '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#1f5d70"><meta name="description" content="A private record of what happens at school. Everything stays on your phone."><meta name="robots" content="noindex,nofollow"><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" href="icon-192.png"><meta name="apple-mobile-web-app-title" content="KidArmor"><style>[hidden]{display:none!important}html,body{margin:0}</style></head><body>'; cat body.min.html; printf '%s\n' '</body></html>'; } > ../index.html
rm body.min.html
# Content Security Policy: blocks the page from sending data to other websites
python3 - <<'PY'
import re,hashlib,base64
csp=open("csp.txt").read().strip()
s=open("../index.html").read()
# allow only this page's own inline script(s), by hash (no 'unsafe-inline')
hs=["'sha256-"+base64.b64encode(hashlib.sha256(m.encode()).digest()).decode()+"'" for m in re.findall(r"<script>(.*?)</script>",s,re.S)]
csp=csp.replace("script-src 'self' 'unsafe-inline'","script-src 'self' "+" ".join(hs))
s=s.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">',1)
open("../index.html","w").write(s)
PY
