"""Negative control for web/frontend/scripts/pixel-diff.py — the zero-tolerance render
comparison. A tool that never fails proves nothing: an alpha-only comparison once passed a
render set that differed on 34 of 39 tiles. One changed channel of one pixel must FAIL;
nothing changed (even re-encoded bytes) must PASS."""
import importlib.util
import os
import shutil

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, '..', 'web', 'frontend', 'scripts', 'pixel-diff.py')


def load():
    spec = importlib.util.spec_from_file_location('pixel_diff', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def make_sets(root):
    """two render sets 'a' and 'b', each with one opaque 64×48 tile in group 'runner'"""
    img = Image.new('RGBA', (64, 48), (200, 190, 170, 255))
    for x in range(64):
        img.putpixel((x, 20), (30, 120, 90, 255))            # some structure
    for s in ('a', 'b'):
        os.makedirs(os.path.join(root, s, 'runner'))
        img.save(os.path.join(root, s, 'runner', 'tile.png'))
    return os.path.join(root, 'b', 'runner', 'tile.png')


def test_identical_sets_pass(tmp_path):
    make_sets(str(tmp_path))
    assert load().main('a', 'b', root=str(tmp_path)) == 0


def test_reencoded_but_pixel_identical_passes(tmp_path):
    tile = make_sets(str(tmp_path))
    Image.open(tile).save(tile, optimize=True, compress_level=9)   # same pixels, other bytes
    assert load().main('a', 'b', root=str(tmp_path)) == 0


def test_one_pixel_colour_change_fails(tmp_path):
    tile = make_sets(str(tmp_path))
    img = Image.open(tile).convert('RGBA')
    r, g, b, a = img.getpixel((5, 5))
    img.putpixel((5, 5), (r, g, (b + 1) % 256, a))                  # ONE channel of ONE pixel
    img.save(tile)
    assert load().main('a', 'b', root=str(tmp_path)) == 1


def test_missing_tile_fails(tmp_path):
    tile = make_sets(str(tmp_path))
    os.remove(tile)
    assert load().main('a', 'b', root=str(tmp_path)) == 1
