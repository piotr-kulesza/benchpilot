#!/usr/bin/env python3
"""liquid-sheet-compose.py — the liquid sheet as pages: each station a row (start · middle · end),
under each tile the volume the LEDGER says and the volume the scene DRAWS.

  python3 scripts/liquid-sheet-compose.py [dev-shots/liquid/neutrophil_rna]
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

d = sys.argv[1] if len(sys.argv) > 1 else 'dev-shots/liquid/neutrophil_rna'
rows = json.load(open(os.path.join(d, 'sheet.json')))
TW, TH, CAP, HEAD, PER = 420, 371, 74, 34, 9
def font(sz, bold=False):
    for f in (['/System/Library/Fonts/Supplemental/Arial Bold.ttf'] if bold else []) + ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf']:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
F, FB, FS = font(15), font(16, True), font(13)
def fmt(ul):
    if ul is None: return '—'
    if ul >= 1000: return f"{ul/1000:.2f}".rstrip('0').rstrip('.') + ' mL'
    return f"{ul:.0f} µl" if ul >= 10 else f"{ul:.1f} µl"
NAMES = {'tube': 'tube', 'column': 'column', 'flow': 'collection', 'elu': 'eluate', 'tip': 'tip'}
def led(rec, side, k):
    if k == 'prep': k = next((x for x in rec[side] if x.startswith('prep:')), None) or ''
    v = rec[side].get(k)
    return v['ul'] if v else 0
pages = [rows[i:i + PER] for i in range(0, len(rows), PER)]
for pi, page in enumerate(pages):
    W, H = 3 * TW, len(page) * (HEAD + TH + CAP)
    sheet = Image.new('RGB', (W, H), (250, 249, 246)); g = ImageDraw.Draw(sheet)
    y = 0
    for r in page:
        g.rectangle([0, y, W, y + HEAD], fill=(232, 229, 222))
        g.text((10, y + 8), f"station {r['s']} · step {r['index']} · {r['action']} — {r['text'][:110]}", font=FB, fill=(30, 34, 40))
        y += HEAD
        for ti, t in enumerate(r['tiles']):
            im = Image.open(os.path.join(d, t['file'])).convert('RGB').resize((TW, TH))
            sheet.paste(im, (ti * TW, y))
            side = {'start': 'start', 'end': 'end'}.get(t['label'])
            parts = []
            for k, v in t['vols'].items():
                if k == 'tip' and v['drawn'] < 0.05: continue
                if k != 'tip' and v['drawn'] < 0.05 and (not side or led(r['rec'], side, k) < 0.05): continue
                s = f"{NAMES.get(k, k)} {fmt(v['drawn'])}"
                parts.append(s)
            ledger = '' if not side else ' · '.join(f"{NAMES.get(k, k if not k.startswith('prep:') else 'mix')} {fmt(v['ul'])}" for k, v in r['rec'][side].items() if v['ul'] > 0.05) or 'empty'
            cy = y + TH + 6
            g.text((ti * TW + 8, cy), t['label'].upper(), font=FB, fill=(2, 120, 106))
            g.text((ti * TW + 8, cy + 20), 'drawn: ' + (' · '.join(parts) or 'empty'), font=F, fill=(30, 34, 40))
            if side: g.text((ti * TW + 8, cy + 42), 'ledger: ' + ledger, font=FS, fill=(90, 96, 104))
            else: g.text((ti * TW + 8, cy + 42), f"p = 0.5 of {t['dur']:.1f} s", font=FS, fill=(90, 96, 104))
        y += TH + CAP
    out = os.path.join(d, f'liquid-sheet-{pi + 1}.png')
    sheet.save(out); print(out)
