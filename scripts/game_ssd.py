"""The game's SpriteStudio layout files (.ssd) for the battle maps: reading them and drawing their cells.

Used by scripts/build_field_art.py (Pirate Rumble's plaza) and scripts/build_assault_art.py (Assault Rumble's lava
field). Format reversed by 2Shankz; the same reading as OPTC Decomp's optclib/ssd.py.

A file holds frames (45 fps); a frame lists cells back to front. A cell is a rectangle of an atlas (`tex` = the
file's texture index) with an anchor inside it (`ax`, `ay`: the format's "position"), drawn at a world point (`wx`,
`wy`: its "pivot", y down) with a rotation (degrees), scale and opacity. Cells come from bones (`name`); a bone only
present in some frames is how the maps animate (the crowd's poses, the torches' flames).
"""
from __future__ import annotations

import math
import struct

import cv2
import numpy as np

FPS = 45
_REC = struct.Struct("<HHHHHHhhhhHHfffH")


def read_ssd(path: str) -> list[list[dict]]:
    """The file's frames, each a list of cells (dicts) back to front."""
    raw = open(path, "rb").read()
    size = struct.unpack_from("<I", raw, 0)[0]
    if size != len(raw) - 4 or raw[-3:] != b"\x00\x64\x00":
        raise SystemExit(f"Not an .ssd file: {path}")
    o = 4
    (n,) = struct.unpack_from("<H", raw, o); o += 2
    for _ in range(n):  # texture names
        (k,) = struct.unpack_from("<H", raw, o); o += 2 + k
    (nf,) = struct.unpack_from("<H", raw, o); o += 2
    frames = []
    for _ in range(nf):
        (nb,) = struct.unpack_from("<H", raw, o); o += 2
        cells = []
        for _ in range(nb):
            u = _REC.unpack_from(raw, o); o += _REC.size
            if u[15] == 1:  # an event: 7 reserved shorts, then a command string
                o += 14
                (k,) = struct.unpack_from("<H", raw, o); o += 2 + k
            cells.append(dict(bone=u[0], u=u[2], v=u[3], w=u[4], h=u[5], wx=u[6], wy=u[7], ax=u[8], ay=u[9],
                              a=u[10] / 255, rot=u[12], sx=u[13], sy=u[14]))
        frames.append(cells)
    version = struct.unpack_from("<3H", raw, size - 5)[1]
    fmt, rs = ("<HHHhH", 10) if version >= 100 else ("<HHHH", 8)
    (nb,) = struct.unpack_from("<H", raw, o); o += 2
    bones = {}
    for _ in range(nb):
        u = struct.unpack_from(fmt, raw, o); o += rs
        k = u[-1]
        bones[u[0]] = dict(name=raw[o:o + k].decode(), tex=u[2]); o += k
    for f in frames:
        for c in f:
            c["name"], c["tex"] = bones[c["bone"]]["name"], bones[c["bone"]]["tex"]
    return frames


def cell_matrix(c: dict, scale: float, t: tuple[float, float]) -> np.ndarray:
    """Atlas cell px -> game px (game px = world px x scale + t)."""
    r = math.radians(c["rot"])
    A = np.array([[math.cos(r) * c["sx"], -math.sin(r) * c["sy"]], [math.sin(r) * c["sx"], math.cos(r) * c["sy"]]])
    off = np.array([c["wx"], c["wy"]], float) - A @ np.array([c["ax"], c["ay"]], float)
    return np.hstack([A * scale, (off * scale + np.array(t))[:, None]])


def bounds(cells: list[dict], scale: float, t: tuple[float, float]) -> tuple[int, int, int, int]:
    """The cells' bounding box in game px (x, y, w, h), whole pixels."""
    pts = []
    for c in cells:
        if not c["w"] or not c["h"]:
            continue
        M = cell_matrix(c, scale, t)
        for lx, ly in [(0, 0), (c["w"], 0), (c["w"], c["h"]), (0, c["h"])]:
            pts.append(M @ np.array([lx, ly, 1.0]))
    p = np.array(pts)
    x0, y0 = math.floor(p[:, 0].min()), math.floor(p[:, 1].min())
    return x0, y0, math.ceil(p[:, 0].max()) - x0, math.ceil(p[:, 1].max()) - y0


def render(cells: list[dict], scale: float, t: tuple[float, float], rect: tuple[int, int, int, int],
           atlases: list[np.ndarray], glow: tuple[str, ...] = ()) -> np.ndarray:
    """Cells composited back to front into a straight-alpha BGRA image of rect (x, y, w, h in game px). Cells whose
    bone name starts with one of `glow` are added (additive blend)."""
    x0, y0, w, h = rect
    col = np.zeros((h, w, 3), np.float32)  # premultiplied colour
    alpha = np.zeros((h, w, 1), np.float32)
    for c in cells:
        if not c["w"] or not c["h"] or c["a"] <= 0:
            continue
        # one repeated edge pixel around the cell: cells that meet edge to edge overlap by it instead of leaving a
        # half-covered seam between them
        src = cv2.copyMakeBorder(atlases[c["tex"]][c["v"]:c["v"] + c["h"], c["u"]:c["u"] + c["w"]], 1, 1, 1, 1, cv2.BORDER_REPLICATE)
        M = cell_matrix(c, scale, t)
        M[:, 2] -= (x0, y0)
        M[:, 2] -= M[:, :2] @ np.array([1.0, 1.0])
        p = src.astype(np.float32)
        p[:, :, :3] *= p[:, :, 3:4] / 255  # premultiplied, so edges don't darken when resampled
        lay = cv2.warpAffine(p, M.astype(np.float32), (w, h), flags=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        a = lay[:, :, 3:4] / 255 * c["a"]
        rgb = lay[:, :, :3] * c["a"]  # premultiplied, times the cell's opacity
        if c["name"].startswith(glow) and glow:
            col = np.minimum(255, col + rgb)
            alpha = np.maximum(alpha, np.max(rgb, axis=2, keepdims=True) / 255)
        else:
            col = col * (1 - a) + rgb
            alpha = alpha * (1 - a) + a
    out = np.zeros((h, w, 4), np.uint8)
    out[:, :, :3] = np.clip(col / np.maximum(alpha, 1e-6), 0, 255).astype(np.uint8)
    out[:, :, 3:] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    return out


def load_atlases(paths: list[str]) -> list[np.ndarray]:
    out = []
    for p in paths:
        a = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if a is None:
            raise SystemExit(f"Missing {p}")
        out.append(a)
    return out
