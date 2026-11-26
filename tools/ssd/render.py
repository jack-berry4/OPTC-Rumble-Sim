"""Render frames of an `.ssd` animation to PNG (proof that the format is fully drawable).

Each drawn record is: crop the cell (cell_x, cell_y, cell_w, cell_h) from texture[texture],
scale it by (scale_x, scale_y) about its pivot (pivot_x, pivot_y), rotate it by `rotation`
degrees about the pivot, and put the pivot at (x, y) in animation space (+y down).
Records are drawn in file order (later = on top), with their alpha.

The texture of a record comes from its part (part table `texture` field). Only texture 0 of a
unit is available in the extracted data (`<sid>_<id>_<slug>_reverse.png`); records on other
textures (effects on multi-sheet units) are skipped and counted.

Usage:
    python -I render.py <file.ssd> <sheet.png> <out_prefix> <frame> [<frame> ...]
           [--scale 2] [--size 320x260] [--origin 160,190] [--strip]
    --strip  also writes <out_prefix>_strip.png with all requested frames side by side.
"""
from __future__ import annotations

import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ssd  # noqa: E402

SKIP_PREFIX = ('UDAT',)   # user-data carrier parts draw a 0.01-scale dummy; never visible


def render_frame(s: ssd.SSD, sheets: list, fi: int, size=(320, 260), origin=(160, 190),
                 zoom=1.0, bg=(40, 44, 52, 255)):
    canvas = Image.new('RGBA', size, bg)
    skipped = 0
    for st in s.frames[fi]:
        if not st.draws or st.alpha == 0:
            continue
        if s.part_name(st.part).startswith(SKIP_PREFIX):
            continue
        tex = s.part_texture(st.part)
        if tex >= len(sheets) or sheets[tex] is None:
            skipped += 1
            continue
        cell = sheets[tex].crop((st.cell_x, st.cell_y, st.cell_x + st.cell_w, st.cell_y + st.cell_h))
        sx, sy = st.scale_x * zoom, st.scale_y * zoom
        fx, fy = sx < 0, sy < 0
        w = max(1, round(abs(sx) * st.cell_w))
        h = max(1, round(abs(sy) * st.cell_h))
        img = cell.resize((w, h), Image.Resampling.BILINEAR)
        px, py = st.pivot_x * abs(sx), st.pivot_y * abs(sy)
        if fx:
            img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT); px = w - px
        if fy:
            img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM); py = h - py
        if st.alpha < 255:
            a = img.getchannel('A').point(lambda v, k=st.alpha: v * k // 255)
            img.putalpha(a)
        # rotate about the pivot: pad so the pivot is the image centre, then rotate
        r = st.rotation
        if r:
            R = math.ceil(math.hypot(max(px, w - px), max(py, h - py)))
            pad = Image.new('RGBA', (2 * R, 2 * R), (0, 0, 0, 0))
            pad.paste(img, (int(round(R - px)), int(round(R - py))))
            # PIL rotates counter-clockwise for positive angles; SpriteStudio's +y-down
            # screen rotation is taken as clockwise for positive degrees (unverified sign).
            img = pad.rotate(-r, resample=Image.Resampling.BILINEAR)
            px = py = R
        dx = int(round(origin[0] + st.x * zoom - px))
        dy = int(round(origin[1] + st.y * zoom - py))
        layer = Image.new('RGBA', size, (0, 0, 0, 0))
        layer.paste(img, (dx, dy))
        canvas = Image.alpha_composite(canvas, layer)
    return canvas, skipped


def load_sheets(s: ssd.SSD, sheet_paths: list):
    sheets = []
    for i in range(len(s.textures)):
        if i < len(sheet_paths) and sheet_paths[i]:
            sheets.append(Image.open(sheet_paths[i]).convert('RGBA'))
        else:
            sheets.append(None)
    return sheets


def fit(s: ssd.SSD, sheets: list, frames: list, zoom: float, margin=8):
    """Canvas size and origin that contain every drawable record of the given frames."""
    x0 = y0 = 1e9
    x1 = y1 = -1e9
    for fi in frames:
        for st in s.frames[fi]:
            tex = s.part_texture(st.part)
            if (not st.draws or st.alpha == 0 or s.part_name(st.part).startswith(SKIP_PREFIX)
                    or tex >= len(sheets) or sheets[tex] is None):
                continue
            c, si = math.cos(math.radians(st.rotation)), math.sin(math.radians(st.rotation))
            for cx, cy in ((0, 0), (st.cell_w, 0), (0, st.cell_h), (st.cell_w, st.cell_h)):
                ux = (cx - st.pivot_x) * st.scale_x
                uy = (cy - st.pivot_y) * st.scale_y
                X = (st.x + ux * c - uy * si) * zoom
                Y = (st.y + ux * si + uy * c) * zoom
                x0, x1, y0, y1 = min(x0, X), max(x1, X), min(y0, Y), max(y1, Y)
    if x0 > x1:
        return (64, 64), (32, 32)
    return ((int(x1 - x0) + 2 * margin, int(y1 - y0) + 2 * margin),
            (int(-x0) + margin, int(-y0) + margin))


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    opts = {}
    it = iter(argv)
    for a in it:
        if a.startswith('--'):
            opts[a[2:]] = True if a == '--strip' else next(it)
            if a != '--strip':
                args.remove(opts[a[2:]])
    path, sheet, prefix = args[0], args[1], args[2]
    frames = [int(x) for x in args[3:]]
    zoom = float(opts.get('scale', 1))
    s = ssd.parse(path)
    sheets = load_sheets(s, [sheet])
    if 'size' in opts:
        size = tuple(int(v) for v in opts['size'].split('x'))
        origin = tuple(int(v) for v in opts.get('origin', '160,190').split(','))
    else:
        size, origin = fit(s, sheets, frames, zoom)
    imgs = []
    for fi in frames:
        im, sk = render_frame(s, sheets, fi, size, origin, zoom)
        out = f'{prefix}_f{fi:03d}.png'
        im.save(out)
        imgs.append(im)
        print(out, f'(skipped {sk} records on missing textures)' if sk else '')
    if opts.get('strip') and imgs:
        W = sum(i.width for i in imgs)
        strip = Image.new('RGBA', (W, imgs[0].height))
        x = 0
        for i in imgs:
            strip.paste(i, (x, 0)); x += i.width
        strip.save(f'{prefix}_strip.png')
        print(f'{prefix}_strip.png')


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print(__doc__); sys.exit(1)
    main(sys.argv[1:])
