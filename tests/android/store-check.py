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
# Cold start, timed the way a person sees it: tap the icon -> first frame (Android's own number),
# then -> KidArmor's first screen on screen (checked as fast as the phone can read its screen, ~1-2 s each).
t0 = time.time()
st = adb("shell", "am", "start", "-W", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", PKG + "/.MainActivity")
m = re.search(r"TotalTime:\s*(\d+)", st or "")
log("info", "first frame on screen (Android's launch time)", (m.group(1) + " ms") if m else (st or "?").strip()[:200])
top = adb("shell", "dumpsys", "activity", "activities") or ""
mt = re.search(r"(mResumedActivity|topResumedActivity|ResumedActivity)[^\n]*", top)
log("info", "app in front", mt.group(0).strip()[:160] if mt else "?")

def agree_box(root):
    for nd in nodes(root):
        if nd.get("resource-id") == "agBox":
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", nd.get("bounds", "0,0,0,0")))
            H = int((size.split("x") + ["0", "0"])[1] or 0)
            if y2 - y1 > 20 and y2 <= (H or 99999): return nd
    return None
def phone_log(title):
    lcx = adb("logcat", "-d", "-v", "time", timeout=120) or ""
    pk = (adb("shell", "pidof", PKG) or "").split()
    noise = re.compile(r"RuntimeInit uid 2000|Using default boot image|Leaving lock profiling|Shutting down VM|uiautomator|UiAutomation|Accessibility")
    keep = [l for l in lcx.splitlines() if not noise.search(l) and (re.search(r"KA_LIFE|chromium|cr_|Capacitor|WebView|webview|kidarmor|KidArmor|Console|SplashScreen|Displayed|AndroidRuntime|FATAL|ANR|wm_|am_", l) or any(f"({x})" in l or f"( {x})" in l for x in pk))]
    print(f"---- {title}: phone log (filtered) ----"); print("\n".join(keep[-400:])); print("---- end ----", flush=True)

end = time.time() + 90; root = n = None
anr = 0
while time.time() < end:
    root = dump(); n = agree_box(root)
    if n is not None: break
    # the virtual tablet's own home screen sometimes freezes ("Pixel Launcher isn't responding"):
    # that's the test phone, not KidArmor. Tap Wait, bring KidArmor back and keep checking.
    # Same if the phone's home screen is in front: say so (it's in the results) and reopen KidArmor.
    if anr < 3 and find(root, r"Predicted app|Google Lens|Voice search") is not None:
        anr += 1; ra = re.search(r"ResumedActivity[^\n]*", adb("shell", "dumpsys", "activity", "activities") or "")
        log("info", "home screen was in front; reopening KidArmor", ra.group(0).strip()[:160] if ra else "")
        adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"); time.sleep(3); continue
    d = find(root, r"isn't responding")
    if d is not None and anr < 3:
        anr += 1; w = find(root, r"^\s*Wait\s*$") or find(root, r"Wait")
        if w is not None: adb("shell", "input", "tap", *map(str, center(w)))
        else: adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(2); adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
        log("info", "the test phone's home screen froze; tapped Wait and reopened KidArmor", f"time {anr}")
    time.sleep(0.5)
dump("welcome")
if n is not None:
    secs = time.time() - t0
    log("ok", "Welcome screen shows (agree box on screen)", f"after {secs:.1f} s from tapping the icon (test phones are slower than real ones)")
    log("ok" if secs <= 20 else "FAIL", "loads in a reasonable time", f"{secs:.1f} s")
else:
    upd = find(root, r"update|WebView")
    log("FAIL", "Welcome screen shows (agree box on screen)", ("WebView update page: " if upd is not None else "") + (screen_text(root) or "blank screen"))
    # show what the phone was doing, right in the job log (the results files can be hard to reach)
    phone_log("first open stayed blank")
    print("---- window/activity ----"); print((adb("shell", "dumpsys", "activity", "top") or "")[:3000]); print("---- end ----", flush=True)
snap("3-welcome")
life = [l for l in (adb("logcat", "-d", "-s", "KA_LIFE:*", timeout=60) or "").splitlines() if "KA_LIFE" in l]
log("info", "screen start-ups during first open", " / ".join(x.split("KA_LIFE")[-1].strip(" :()0123456789") for x in life)[:300] or "none logged")

if n is not None:
    box = n
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

# Open it from scratch several more times (like a reviewer closing and reopening it): it must come up every time.
COLD = int(os.environ.get("KA_COLD_STARTS", "5"))
times = []
for i in range(COLD):
    adb("shell", "am", "force-stop", PKG); time.sleep(2)
    t1 = time.time()
    adb("shell", "am", "start", "-W", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", PKG + "/.MainActivity")
    shown = None
    while time.time() < t1 + 45:
        r = dump()
        if find(r, r"Let's set up KidArmor|Welcome to KidArmor|KidArmor is locked|Language") is not None: shown = time.time() - t1; break
        if find(r, r"isn't responding") is not None:
            w = find(r, r"^\s*Wait\s*$") or find(r, r"Wait")
            if w is not None: adb("shell", "input", "tap", *map(str, center(w)))
        time.sleep(0.5)
    times.append(shown)
    if shown is None:
        snap(f"cold-{i+1}-blank")
        lcx = adb("logcat", "-d", "-v", "time", timeout=120) or ""
        print(f"---- cold start {i+1} stayed blank; phone log (filtered) ----")
        print("\n".join([l for l in lcx.splitlines() if re.search(r"chromium|cr_|Capacitor|WebView|AndroidRuntime|kidarmor|ActivityTaskManager|ActivityManager|Console", l)][-150:]))
        print("---- end ----", flush=True)
# Fresh installs: uninstall and install again the way Play does, then open for the first time. Repeated,
# because a first open is what a reviewer sees.
FRESH = int(os.environ.get("KA_FRESH_INSTALLS", "3"))
ftimes = []
for i in range(FRESH):
    adb("uninstall", PKG, timeout=120)
    subprocess.run(["java", "-jar", "bundletool.jar", "install-apks", "--apks=ka.apks"], capture_output=True, timeout=300)
    time.sleep(2); adb("logcat", "-c")
    t1 = time.time()
    adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", PKG + "/.MainActivity")
    shown = None
    while time.time() < t1 + 90:
        r = dump()
        if agree_box(r) is not None: shown = time.time() - t1; break
        if find(r, r"isn't responding") is not None:
            w = find(r, r"^\s*Wait\s*$") or find(r, r"Wait")
            if w is not None: adb("shell", "input", "tap", *map(str, center(w)))
        time.sleep(0.5)
    ftimes.append(shown)
    if shown is None:
        snap(f"fresh-{i+1}-blank"); phone_log(f"fresh install {i+1} stayed blank")
        print("---- top activity ----"); print((adb("shell", "dumpsys", "activity", "top") or "")[:1500]); print("---- end ----", flush=True)
log("ok" if all(t is not None for t in ftimes) else "FAIL", f"first open after a fresh install, {FRESH} more times", ", ".join(f"{t:.1f}s" if t is not None else "BLANK" for t in ftimes))

okc = [t for t in times if t is not None]
log("ok" if len(okc) == COLD else "FAIL", f"opens every time ({COLD} more cold starts)", ", ".join(f"{t:.1f}s" if t is not None else "BLANK" for t in times))
if okc: log("info", "cold start, slowest / typical", f"{max(okc):.1f} s / {sorted(okc)[len(okc)//2]:.1f} s")

lc = adb("logcat", "-d", timeout=120); open(f"{OUT}/logcat-full.txt", "w").write(lc)
app = [l for l in lc.splitlines() if re.search(r"Capacitor|chromium|Console|KidArmor|AndroidRuntime|FATAL|kidarmor|WebView|DEBUG  ", l)]
open(f"{OUT}/app-log.txt", "w").write("\n".join(app))
L = lc.splitlines()
# only KidArmor's own crashes count (the test tool's UiAutomation can crash on a slow virtual tablet)
crash = [L[i] for i, l in enumerate(L) if ("FATAL EXCEPTION" in l and any("Process: com.coastlinecode" in x for x in L[i:i+4])) or re.search(r"ANR in com.coastlinecode|Fatal signal \d+ \(SIG.*kidarmor", l)]
log("ok" if not crash else "FAIL", "no crashes", "; ".join(crash)[:300])
jserr = [l for l in app if re.search(r"Console|chromium", l) and re.search(r"Uncaught|TypeError|ReferenceError|SyntaxError", l)]
log("ok" if not jserr else "FAIL", "no script errors", "; ".join(jserr)[:300])

head = f"Store version on Android API {sdk} ({size}): {sum(1 for l in lines if l.startswith('ok'))} passed, {fails} failed"
open(f"{OUT}/summary.txt", "w").write(head + "\n" + "\n".join(lines) + "\n")
print(head)
sys.exit(0)
