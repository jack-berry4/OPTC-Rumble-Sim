"""Build the replay field's background for Pirate Rumble (and Grand Party) from the game's own map: the market plaza
("pirates_arena_cpu").

    python scripts/build_field_art.py

The game files are in "Background Images/": the plaza's four texture atlases (pirates_arena_cpu_map_01..04.png) and
its SpriteStudio layout file (pirates_arena_cpu_near_01.ssd, from the VE_PiratesArenaMap bundle; the far, middle and
screen layers are empty). The layout places every cell: the paving tiles, the two halves of the backdrop, the soft
shadows, nine crowd groups and the two torches. It loops over 18 frames (0.4 s at 45 fps): the crowd groups swap
between 2 or 3 poses (6 frames = 0.133 s each, or 9; two groups split 8 / 10) and the torches through 3 flames.

Writes public/game-art/plaza/ and public/game-art/layout.json for src/ui/FieldBackdrop.tsx: the cells in the game's
own draw order, as layers back to front: runs of still cells as one image each, and each crowd group / torch as an
animated layer (its frame for each of the 18 game frames; identical frames share one image). Some soft shadows are
drawn over a crowd group in front of them, so the order matters.

Placement: game px = world px x SCALE + OFFSET, a SIFT fit of the layout's still cells to the earlier plaza image
(805 inliers, rotation 0.02 deg, mean residual 0.26 px), which was itself measured on all 33 battles of test runs 1-7
(battle-start frames). Until 2026-11-25 this script placed the atlases by hand from those measurements, with three
crowd members' animations assumed; the layout file replaces all of that (user, 2026-11-25).
"""
from __future__ import annotations

import json
import os
import shutil

import cv2
import numpy as np

from game_ssd import FPS, bounds, load_atlases, read_ssd, render

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "Background Images")
ART = os.path.join(ROOT, "public", "game-art")
OUT = os.path.join(ART, "plaza")

SCALE = 0.92486                  # world px -> game px
OFFSET = (-311.54, 1259.95)
FIELD = (0, 300, 1080, 780)      # x, y, w, h in game px: the replay's field (Replay.tsx FIELD_ART)
WEBP_Q = 90
ANIMATED = ("audience", "fire")  # bones that come and go over the loop


def group_of(c: dict) -> str:
    """A crowd group ("audience_a") or a torch ("fire@<x>"): the poses / flames that take turns in one place."""
    n = c["name"]
    if n.startswith("fire"):
        return f"fire@{c['wx']}"
    return "_".join(n.split("_")[:2])


def clip(rect: tuple[int, int, int, int]) -> tuple[int, int, int, int] | None:
    """rect cut to the field (x, y, w, h), or None if nothing is left."""
    x0, y0 = max(rect[0], FIELD[0]), max(rect[1], FIELD[1])
    x1, y1 = min(rect[0] + rect[2], FIELD[0] + FIELD[2]), min(rect[1] + rect[3], FIELD[1] + FIELD[3])
    return (x0, y0, x1 - x0, y1 - y0) if x1 > x0 and y1 > y0 else None


def tight(img: np.ndarray, rect: tuple[int, int, int, int]) -> tuple[np.ndarray, tuple[int, int, int, int]] | None:
    """The image cropped to its visible pixels."""
    ys, xs = np.nonzero(img[:, :, 3] > 0)
    if not len(xs):
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return img[y0:y1, x0:x1], (rect[0] + int(x0), rect[1] + int(y0), int(x1 - x0), int(y1 - y0))


def main() -> None:
    atlases = load_atlases([os.path.join(SRC, f"pirates_arena_cpu_map_0{i}.png") for i in range(1, 5)])
    frames = read_ssd(os.path.join(SRC, "pirates_arena_cpu_near_01.ssd"))
    is_anim = lambda c: c["name"].startswith(ANIMATED)

    # the draw order, from frame 0: runs of still cells between the animated groups' places
    order: list[tuple[str, object]] = []
    for c in frames[0]:
        if not c["w"] or not c["h"]:
            continue
        if is_anim(c):
            g = group_of(c)
            if not (order and order[-1] == ("group", g)):
                order.append(("group", g))
        elif order and order[-1][0] == "still":
            order[-1][1].append(c)  # type: ignore[union-attr]
        else:
            order.append(("still", [c]))

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    # the earlier hand-placed plaza's files (field.png and the crowd frames) go
    for f in os.listdir(ART):
        if f.endswith(".png") and os.path.isfile(os.path.join(ART, f)):
            os.remove(os.path.join(ART, f))

    layers, n_still, n_files = [], 0, 0
    for kind, what in order:
        if kind == "still":
            rect = clip(bounds(what, SCALE, OFFSET))
            if not rect:
                continue
            got = tight(render(what, SCALE, OFFSET, rect, atlases), rect)
            if not got:
                continue
            img, r = got
            fn = f"still-{n_still}.webp"; n_still += 1
            cv2.imwrite(os.path.join(OUT, fn), img, [cv2.IMWRITE_WEBP_QUALITY, WEBP_Q])
            layers.append(dict(href=f"plaza/{fn}", x=r[0], y=r[1], w=r[2], h=r[3]))
            continue
        g = what
        seen: dict[tuple, dict] = {}
        seq = []
        for f in frames:
            cells = [c for c in f if is_anim(c) and group_of(c) == g]
            key = tuple((c["name"], c["u"], c["v"], c["w"], c["h"], c["wx"], c["wy"], c["ax"], c["ay"], c["a"], c["rot"], c["sx"], c["sy"]) for c in cells)
            if key not in seen:
                rect = clip(bounds(cells, SCALE, OFFSET)) if cells else None
                got = tight(render(cells, SCALE, OFFSET, rect, atlases), rect) if rect else None
                if got:
                    img, r = got
                    fn = f"{g.replace('@', '-')}-{len(seen)}.webp"
                    cv2.imwrite(os.path.join(OUT, fn), img, [cv2.IMWRITE_WEBP_QUALITY, WEBP_Q]); n_files += 1
                    seen[key] = dict(href=f"plaza/{fn}", x=r[0], y=r[1], w=r[2], h=r[3])
                else:
                    seen[key] = dict(href="", x=0, y=0, w=0, h=0)  # off the field this frame
            seq.append(seen[key])
        if any(s["href"] for s in seq):
            layers.append(dict(name=g, frames=seq, frameS=round(1 / FPS, 6)))

    with open(os.path.join(ART, "layout.json"), "w") as fh:
        json.dump(dict(layers=layers, sprites=[]), fh, indent=1)
    print(f"wrote {OUT}: {len(layers)} layers ({n_still} still, {len(layers) - n_still} animated, {n_files} frame images), "
          f"loop {len(frames)} frames = {len(frames) / FPS:.2f} s")


if __name__ == "__main__":
    main()
