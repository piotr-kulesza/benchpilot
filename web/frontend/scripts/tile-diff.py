#!/usr/bin/env python3
"""tile-diff.py — compare two render sets tile by tile (dev-shots/<a> vs dev-shots/<b>).

Every tile is either IDENTICAL (zero differing pixels) or listed with the number of differing
pixels and the largest channel difference. Captures are deterministic (scripts/lib/
determinism.mjs), so the noise floor is zero: any difference is a change.

  python3 scripts/tile-diff.py approved current [--group runner] [--only neutrophil_rna]
"""
import sys, os, json
from PIL import Image
import numpy as np

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
a_set, b_set = args[0], args[1]
root = os.path.join(os.getcwd(), 'dev-shots')
groups = [opt('--group')] if opt('--group') else ['models', 'matrix', 'runner']
only = opt('--only')
same, diff, missing = 0, [], []
for g in groups:
    da, db = os.path.join(root, a_set, g), os.path.join(root, b_set, g)
    if not os.path.isdir(da) or not os.path.isdir(db):
        continue
    for f in sorted(x for x in os.listdir(da) if x.endswith('.png')):
        if only and only not in f:
            continue
        pb = os.path.join(db, f)
        if not os.path.exists(pb):
            missing.append(f'{g}/{f}'); continue
        A = np.asarray(Image.open(os.path.join(da, f)).convert('RGB'), dtype=np.int16)
        B = np.asarray(Image.open(pb).convert('RGB'), dtype=np.int16)
        if A.shape != B.shape:
            diff.append((f'{g}/{f}', -1, -1)); continue
        d = np.abs(A - B).max(axis=2)
        n = int((d > 0).sum())
        if n == 0: same += 1
        else: diff.append((f'{g}/{f}', n, int(d.max())))
for t, n, m in diff:
    print(f'DIFF  {t}  {n} px  max Δ{m}' if n >= 0 else f'DIFF  {t}  size changed')
for t in missing:
    print(f'MISSING  {t}')
print(f'\n{a_set} → {b_set}: {same} identical, {len(diff)} different, {len(missing)} missing')
if '--json' in sys.argv:
    print(json.dumps({'identical': same, 'different': [t for t, _, _ in diff], 'missing': missing}))
sys.exit(1 if diff or missing else 0)
