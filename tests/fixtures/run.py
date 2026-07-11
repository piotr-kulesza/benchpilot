import os, sys, json, urllib.request, urllib.error
from collections import Counter

ROOT = "/tmp/bench"
sys.path.insert(0, ROOT)

# load .env
with open(os.path.join(ROOT, ".env")) as fh:
    for line in fh:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v

from core.parse import parse_protocol, DEFAULT_MODEL
from core.schema import ACTIONS

REAL_VERBS = [a for a in ACTIONS if a != "generic"]

def llm(system, user):
    body = json.dumps({
        "model": DEFAULT_MODEL,
        "max_tokens": 20000,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")

def short(s, n=70):
    s = (s or "").replace("\n", " ")
    return s if len(s) <= n else s[:n-1] + "…"

files = ["transformation", "pcr", "western"]
agg = Counter()
agg_generic = 0
agg_total = 0
per_proto = {}

for name in files:
    path = os.path.join(ROOT, "protocols", name + ".txt")
    text = open(path, encoding="utf-8").read()
    try:
        proto = parse_protocol(text, llm=llm, source=name + ".txt", use_cache=False)
    except urllib.error.HTTPError as e:
        print(f"### {name}: HTTPError {e.code}: {e.read().decode()[:500]}")
        continue
    d = proto.to_dict()
    steps = d["steps"]
    actions = [s["action"] for s in steps]
    alt_actions = [alt.get("action") for s in steps for alt in s.get("alternatives", [])]
    c = Counter(actions)
    gen = c.get("generic", 0)
    per_proto[name] = (len(steps), c, gen, alt_actions)
    agg.update(actions)
    agg_generic += gen
    agg_total += len(steps)

    print("\n" + "=" * 78)
    print(f"### {name}   —   {len(steps)} steps   |   generic: {gen} ({100*gen/max(len(steps),1):.0f}%)")
    print("=" * 78)
    for s in steps:
        dur = s.get("duration_seconds")
        durs = f" {int(dur)}s" if dur else ""
        flag = "  <<< GENERIC" if s["action"] == "generic" else ""
        print(f"  [{s['index']:>2}] {s['action']:<14} {s['kind']:<8}{durs:<7} {short(s.get('text_en') or s.get('text'))}{flag}")
    if alt_actions:
        print("  alternatives' actions:", alt_actions)
    print("  action counts:", dict(c))

print("\n" + "#" * 78)
print("AGGREGATE")
print("#" * 78)
print(f"total steps: {agg_total} | generic: {agg_generic} ({100*agg_generic/max(agg_total,1):.0f}%) | covered: {100*(agg_total-agg_generic)/max(agg_total,1):.0f}%")
print("verb usage across all 3:", dict(agg.most_common()))
used = set(agg)
print("verbs NEVER used:", [v for v in REAL_VERBS if v not in used])
