import os, sys, json, urllib.request, urllib.error
from collections import Counter
ROOT="/tmp/bench"; sys.path.insert(0, ROOT)
with open(os.path.join(ROOT,".env_key")) as fh:
    for line in fh:
        line=line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k,_,v=line.partition("="); k,v=k.strip(),v.strip().strip('"').strip("'")
        if k and v and k not in os.environ: os.environ[k]=v
from core.parse import parse_protocol, DEFAULT_MODEL
def llm(system,user):
    body=json.dumps({"model":DEFAULT_MODEL,"max_tokens":20000,"system":system,"messages":[{"role":"user","content":user}]}).encode()
    req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,
        headers={"x-api-key":os.environ["ANTHROPIC_API_KEY"],"anthropic-version":"2023-06-01","content-type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=280) as r: data=json.loads(r.read().decode())
    return "".join(b.get("text","") for b in data.get("content",[]) if b.get("type")=="text")
def short(s,n=70):
    s=(s or "").replace("\n"," "); return s if len(s)<=n else s[:n-1]+"…"
names=sys.argv[1:]
agg=Counter(); tot=0; gtot=0
for name in names:
    text=open(f"{ROOT}/protocols/{name}.txt",encoding="utf-8").read()
    proto=parse_protocol(text,llm=llm,source=name+".txt",use_cache=True)
    d=proto.to_dict(); steps=d["steps"]; c=Counter(s["action"] for s in steps); gen=c.get("generic",0)
    agg.update(c); tot+=len(steps); gtot+=gen
    print("\n"+"="*80)
    print(f"### {name} — {len(steps)} steps | generic: {gen} ({100*gen/max(len(steps),1):.0f}%)")
    print("="*80)
    for s in steps:
        dur=s.get("duration_seconds"); durs=f" {int(dur)}s" if dur else ""
        flag="  <<< GENERIC" if s["action"]=="generic" else ""
        print(f"  [{s['index']:>2}] {s['action']:<14} {s['kind']:<8}{durs:<8} {short(s.get('text_en') or s.get('text'))}{flag}")
    alts=[a.get('action') for s in steps for a in s.get('alternatives',[])]
    if alts: print("  alternatives:", alts)
    print("  counts:", dict(c))
print("\n"+"#"*80)
print(f"NEW-BATCH AGGREGATE: {tot} steps | generic {gtot} ({100*gtot/max(tot,1):.0f}%)")
print("counts:", dict(agg.most_common()))
