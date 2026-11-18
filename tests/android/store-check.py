#!/usr/bin/env python3
"""Opens the Google Play (store) version of KidArmor on a virtual phone, the way a Play reviewer would:
first open, the Welcome screen, check the box, Continue, then the app's first screen.
The store version can't be remote-controlled like the test version, so this reads the screen
(uiautomator) and taps what a person would tap. Writes summary.txt, screenshots and logs to OUT."""
import os, re, subprocess, sys, time, xml.etree.ElementTree as ET

OUT = os.environ.get("OUT", "store"); os.makedirs(OUT, exist_ok=True)
PKG = "com.coastlinecode.kidarmor"
lines = []; fails = 0

def log(kind, what, detail=""):
    global fails
    if kind == "FAIL": fails += 1
    s = f"{kind:<4} {what}" + (f"  → {detail}" if detail else ""); print(s, flush=True); lines.append(s)

def adb(*a, timeout=60):
    try: return subprocess.run(["adb", *a], capture_output=True, text=True, timeout=timeout).stdout
    except Exception as e: return f"ERR {e}"

def snap(name):
    with open(f"{OUT}/{name}.png", "wb") as f:
        f.write(subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True, timeout=60).stdout)

def dump(name=None):
    for _ in range(3):
        adb("shell", "uiautomator", "dump", "/sdcard/ui.xml", timeout=90)
        x = adb("exec-out", "cat", "/sdcard/ui.xml")
        if "<hierarchy" in x:
            if name: open(f"{OUT}/{name}.xml", "w").write(x)
            try: return ET.fromstring(x[x.index("<hierarchy"):])
            except ET.ParseError: pass
        time.sleep(2)
    return None

def nodes(root):
    return [] if root is None else list(root.iter("node"))

def label(n): return (n.get("text") or "") + " " + (n.get("content-desc") or "")

def center(n):
    m = re.findall(r"\d+", n.get("bounds", "")); x1, y1, x2, y2 = map(int, m)
    return (x1 + x2) // 2, (y1 + y2) // 2

def find(root, pat, **attrs):
    for n in nodes(root):
        if re.search(pat, label(n), re.I) and all(n.get(k) == v for k, v in attrs.items()): return n
    return None

def wait_for(pat, secs, name=None):
    end = time.time() + secs; root = None
    while time.time() < end:
        root = dump(); n = find(root, pat)
        if n is not None:
            if name: dump(name)
            return root, n
        time.sleep(3)
    if name: dump(name)
    return root, None

def screen_text(root):
    return " | ".join(t for t in (label(n).strip() for n in nodes(root)) if t)[:600]

sdk = adb("shell", "getprop", "ro.build.version.sdk").strip()
wv = adb("shell", "dumpsys", "webviewupdate")
m = re.search(r"Current WebView package \(name, version\): \(([^,]+), ([^)]+)\)", wv)
size = adb("shell", "wm", "size").strip().replace("Physical size: ", "")
abi = adb("shell", "getprop", "ro.product.cpu.abi").strip()
log("info", "phone", f"Android API {sdk}, {abi}, screen {size}, WebView {m.group(2) if m else '?'}")

pid = adb("shell", "pidof", PKG).strip()
adb("logcat", "-c")
adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
t0 = time.time()
time.sleep(5); snap("1-after-5s")
time.sleep(10); snap("2-after-15s")

root, n = wait_for(r"Welcome to KidArmor|updated our terms", 90, "welcome")
if n is not None:
    log("ok", "Welcome screen shows", f"after {int(time.time() - t0)} s")
else:
    upd = find(root, r"update|WebView")
    log("FAIL", "Welcome screen shows", ("WebView update page: " if upd is not None else "") + (screen_text(root) or "blank screen"))
snap("3-welcome")

if n is not None:
    box = next((nd for nd in nodes(root) if nd.get("resource-id") == "agBox"), None)
    if box is None: box = next((nd for nd in nodes(root) if nd.get("class") == "android.widget.CheckBox" and nd.get("bounds") != "[0,0][0,0]"), None)
    if box is not None:
        adb("shell", "input", "tap", *map(str, center(box))); time.sleep(2)
        root = dump("after-check")
        go = next((nd for nd in nodes(root) if nd.get("resource-id") == "agGo"), None) or find(root, r"^Continue")
        ok = go is not None and go.get("enabled") == "true"
        log("ok" if ok else "FAIL", "checking the box turns on Continue", "enabled" if ok else "still off")
        snap("4-box-checked")
        if go is not None:
            adb("shell", "input", "tap", *map(str, center(go))); time.sleep(3)
            root, nxt = wait_for(r"set up KidArmor|Step 1 of", 30, "after-continue")
            gone = not any(nd.get("resource-id") == "agGo" for nd in nodes(root))
            log("ok" if (nxt is not None and gone) else "FAIL", "Continue opens the app", screen_text(root)[:200])
            snap("5-after-continue")
    else:
        log("FAIL", "agree checkbox found", screen_text(root)[:200])

time.sleep(2)
still = adb("shell", "pidof", PKG).strip()
log("ok" if still else "FAIL", "app still running", f"pid {still}" if still else "not running")

lc = adb("logcat", "-d", timeout=120); open(f"{OUT}/logcat-full.txt", "w").write(lc)
app = [l for l in lc.splitlines() if re.search(r"Capacitor|chromium|Console|KidArmor|AndroidRuntime|FATAL|kidarmor|WebView|DEBUG  ", l)]
open(f"{OUT}/app-log.txt", "w").write("\n".join(app))
crash = [l for l in lc.splitlines() if re.search(r"FATAL EXCEPTION|ANR in com.coastlinecode|signal \d+ \(SIG", l)]
log("ok" if not crash else "FAIL", "no crashes", "; ".join(crash)[:300])
jserr = [l for l in app if re.search(r"Uncaught|TypeError|ReferenceError|SyntaxError", l)]
log("ok" if not jserr else "FAIL", "no script errors", "; ".join(jserr)[:300])

head = f"Store version on Android API {sdk} ({size}): {sum(1 for l in lines if l.startswith('ok'))} passed, {fails} failed"
open(f"{OUT}/summary.txt", "w").write(head + "\n" + "\n".join(lines) + "\n")
print(head)
sys.exit(0)
