#!/usr/bin/env python3
"""liquid-frames-sheet.py — the frames where the liquid invariant failed, BEFORE and AFTER the fix,
side by side; under each tile every vessel's drawn volume and colour (hex), and what failed there.

  python3 scripts/liquid-frames-sheet.py [dev-shots/liquid-frames] [dev-shots/liquid-frames-before.json]
Inputs: <dir>/before/NN_fK.png|json and <dir>/after/NN_fK.png|json (scripts/liquid-frames.mjs --snap).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1] if len(sys.argv) > 1 else 'dev-shots/liquid-frames'
rep = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'dev-shots/liquid-frames-before.json'))
bad = {(r['station'], b['frame']): [] for r in rep for b in r['bad']}
for r in rep:
    for b in r['bad']: bad[(r['station'], b['frame'])].append(b)
act = {r['station']: r['action'] for r in rep}

def font(sz, bold=False):
    for f in (['/System/Library/Fonts/Supplemental/Arial Bold.ttf'] if bold else []) + ['/System/Library/Fonts/Supplemental/Arial.ttf']:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
F, FB, FS = font(14), font(15, True), font(13)
NAMES = {'tube': 'tube', 'column': 'column', 'flow': 'collection', 'elu': 'eluate', 'prep0': 'DNase mix', 'waste': 'waste', 'source r': 'bottle', 'source r0': 'bottle 1', 'source r1': 'bottle 2'}
def fmt(ul): return f"{ul:.1f} µl" if ul < 1000 else f"{ul/1000:.3f} mL"
def lines(fr):
    out = []
    for k, v in fr['vessels'].items():
        if k.startswith('source') and v['ul'] > 100000: out.append(f"{NAMES.get(k, k)} {v['ul']/1000:.3f} mL {v['color'] or ''}"); continue
        if v['ul'] < 0.05 and k not in ('tube', 'column', 'flow', 'elu'): continue
        out.append(f"{NAMES.get(k, k)} {fmt(v['ul'])} {(v['color'] or '') if v['ul'] >= 0.05 else '(empty)'}")
    if fr.get('tip'): out.append(f"tip {fmt(fr['tip']['ul'])} {fr['tip']['color'] if fr['tip']['ul'] >= 0.05 else '(empty)'}")
    return out

snaps = sorted({f[:-4] for f in os.listdir(os.path.join(d, 'before')) if f.endswith('.png')})
TW, TH = 560, 495
rows = []
for name in snaps:
    s, k = int(name[:2]), int(name.split('_f')[1])
    pair = []
    for side in ('before', 'after'):
        p = os.path.join(d, side, name + '.png')
        pair.append((Image.open(p).convert('RGB') if os.path.exists(p) else None, json.load(open(p[:-4] + '.json')) if os.path.exists(p[:-4] + '.json') else None))
    rows.append((s, k, pair))
PER = 6
for pi in range(0, len(rows), PER):
    page = rows[pi:pi + PER]
    hs = []
    for s, k, pair in page:
        n = max(len(lines(fr)) if fr else 0 for _, fr in pair)
        hs.append(28 + 22 * min(3, len(bad.get((s, k), []))) + TH + 18 * n + 16)
    W, Hh = 2 * TW + 10, sum(hs)
    sheet = Image.new('RGB', (W, Hh), (250, 249, 246)); g = ImageDraw.Draw(sheet)
    y = 0
    for (s, k, pair), h in zip(page, hs):
        g.rectangle([0, y, W, y + 26], fill=(232, 229, 222))
        g.text((8, y + 5), f"station {s} · {act.get(s, '')} · frame {k}" + ("  (station entry)" if k == 0 else ''), font=FB, fill=(30, 34, 40))
        g.text((TW + 18, y + 5), "BEFORE (cbcb0cb)                       AFTER", font=FB, fill=(30, 34, 40))
        y += 28
        for b in bad.get((s, k), [])[:3]:
            g.text((8, y), f"x {b['check']}: {b['vessel']} — {b['detail']}", font=F, fill=(170, 40, 40)); y += 22
        for i, (im, fr) in enumerate(pair):
            x = i * (TW + 10)
            if im: sheet.paste(im.resize((TW, TH)), (x, y))
            g.text((x + 6, y + 6), 'BEFORE' if i == 0 else 'AFTER', font=FB, fill=(170, 40, 40) if i == 0 else (2, 120, 106))
            if fr:
                for j, t in enumerate(lines(fr)): g.text((x + 8, y + TH + 4 + 18 * j), t, font=FS, fill=(30, 34, 40))
        y = y - 28 - 22 * min(3, len(bad.get((s, k), []))) + h
    out = os.path.join(d, f'liquid-frames-sheet-{pi // PER + 1}.png')
    sheet.save(out); print(out)
