#!/usr/bin/env python3
"""pixel-diff.py — ZERO-TOLERANCE comparison of two render sets (dev-shots/<A> vs <B>).

Every PNG must exist in both sets and decode to the same size and the same RGBA value at
every pixel. No threshold, no perceptual metric: one changed channel of one pixel fails.
Byte-identical files are accepted without decoding; the rest are decoded and compared.

    python3 scripts/pixel-diff.py preA preB          # the capture's own noise floor
    python3 scripts/pixel-diff.py preA post          # before vs after a change

Exit 1 on any difference (lists the tiles, the changed-pixel count and the bounding box).
"""
import hashlib
import os
import sys

from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dev-shots')


def pngs(set_name):
    base = os.path.join(ROOT, set_name)
    out = {}
    for d, _, files in os.walk(base):
        for f in files:
            if f.endswith('.png'):
                p = os.path.join(d, f)
                out[os.path.relpath(p, base)] = p
    return out


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def main(a, b):
    A, B = pngs(a), pngs(b)
    only_a, only_b = sorted(set(A) - set(B)), sorted(set(B) - set(A))
    changed, identical_bytes, identical_pixels = [], 0, 0
    per_group = {}
    for k in sorted(set(A) & set(B)):
        g = k.split(os.sep)[0]
        per_group.setdefault(g, [0, 0])
        per_group[g][0] += 1
        if sha(A[k]) == sha(B[k]):
            identical_bytes += 1
            continue
        ia, ib = Image.open(A[k]).convert('RGBA'), Image.open(B[k]).convert('RGBA')
        if ia.size != ib.size:
            changed.append((k, 'size %s vs %s' % (ia.size, ib.size)))
            per_group[g][1] += 1
            continue
        diff = ImageChops.difference(ia, ib)
        bbox = diff.getbbox()
        if bbox is None:
            identical_pixels += 1
            continue
        n = sum(1 for px in diff.getdata() if px != (0, 0, 0, 0))
        changed.append((k, '%d px changed, bbox %s' % (n, bbox)))
        per_group[g][1] += 1
    total = len(set(A) & set(B))
    print(f'{a} vs {b}: {total} tiles compared')
    for g in sorted(per_group):
        print(f'  {g:8s} {per_group[g][0]:4d} tiles   {per_group[g][1]} changed')
    print(f'  byte-identical {identical_bytes} · pixel-identical (bytes differ) {identical_pixels} · CHANGED {len(changed)}')
    for k, why in changed:
        print(f'    ✗ {k}: {why}')
    for k in only_a:
        print(f'    ✗ only in {a}: {k}')
    for k in only_b:
        print(f'    ✗ only in {b}: {k}')
    return 1 if (changed or only_a or only_b) else 0


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
