"""Builds resources.json from the state lists and puts a built-in copy into the app.
Inputs (same folder): pa.txt, pti.txt (agent results), attorneys.json (optional).
"""
import json, re, sys, os, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
STATES = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"}
def code(name):
    n = name.strip().replace("Washington DC", "District of Columbia").replace("Washington, DC", "District of Columbia").replace("D.C.", "District of Columbia")
    if n in STATES: return STATES[n]
    if n.upper() in STATES.values(): return n.upper()
    for k, v in STATES.items():
        if n.lower().startswith(k.lower()): return v
    raise SystemExit(f"unknown state: {name}")
def phone(v):
    d=re.sub(r"\D","",v or "")
    if len(d)==11 and d[0]=="1": d=d[1:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if len(d)==10 else (v or "")
def ok(v): return v and "UNVERIFIED" not in v.upper()
def url(v):
    v = v.strip()
    if not ok(v): return ""
    if not v.startswith("http"): v = "https://" + v
    return v
states = {}
for line in open(os.path.join(HERE, "pa.txt")):
    if "|" not in line: continue
    st, name, u, ph = [x.strip() for x in line.split("|")]
    states.setdefault(code(st), {})["pa"] = {"name": name, "url": url(u), "phone": phone(ph)}
pti_file = os.path.join(HERE, "pti.txt")
if os.path.exists(pti_file):
    for line in open(pti_file):
        if line.count("|") < 4 or line.upper().startswith("STATE |"): continue
        st, name, u, ph, doe = [x.strip() for x in line.split("|")[:5]]
        c = code(st); d = states.setdefault(c, {})
        if ok(name): d["pti"] = {"name": re.sub(r"\s*\(.*?\)\s*$", "", name), "url": url(u), "phone": phone(ph) if ok(ph) else ""}
        if ok(doe): d["doe"] = {"url": url(doe)}
att = []
af = os.path.join(HERE, "attorneys.json")
if os.path.exists(af): att = json.load(open(af))
data = {"version": int(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M")), "updated": datetime.date.today().isoformat(), "states": states, "attorneys": att}
out = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
open(os.path.join(HERE, "..", "resources.json"), "w").write(json.dumps(data, ensure_ascii=False, indent=1))
app = sys.argv[1] if len(sys.argv) > 1 else None
if app:
    s = open(app).read()
    s2 = re.sub(r"/\*RES_JSON\*/.*?/\*END_RES_JSON\*/", lambda m: "/*RES_JSON*/" + out + "/*END_RES_JSON*/", s, flags=re.S)
    assert s2 != s or out in s, "marker not found"
    open(app, "w").write(s2)
missing = [k for k in STATES.values() if k not in states or "pti" not in states[k] or "doe" not in states[k]]
print(len(states), "states; missing pti/doe:", missing)
