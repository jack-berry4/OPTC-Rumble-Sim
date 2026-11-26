"""Build the replay field's background for Assault Rumble from the game's own map ("assaultrumble_arena_map_01").

    python scripts/build_assault_art.py

Every Assault Rumble season so far (all 22 in MstAssaultRumbleEvent_, 2025-05 to 2026-11) uses this one map: a lava
field with red crystals and a giant skeleton under a volcano. The game files (from the VE_AssaultRumble bundle) are in
"Background Images/": six texture atlases (assaultrumble_arena_map_01..06.png) and the SpriteStudio layout files of
its layers (..._far_01.ssd: lava, mountain, skeleton, thorn vines, lights; ..._near_01.ssd: lava, the rocky floor,
two rock spires). The middle layer is empty and the screen layer (sparks, ash over the battle) isn't drawn.

Writes public/game-art/assault/: four images in game pixels (the grid's frame, src/engine/grid.ts) covering the
replay's field (FIELD below) and layout.json for src/ui/FieldBackdrop.tsx, drawn back to front:
  far-lava.webp  the far layer's lava strips, which flow along themselves (the game's 960-frame loop: 21.3 s)
  far.webp       the rest of the far layer (frame 0: the thorn vines and lights hold still)
  near-lava.webp the near layer's lava strips (240-frame loop: 5.3 s)
  near.webp      the floor and rocks
A lava image is wider / taller by one loop's travel, so it still covers the field as it slides.

The layout files place each cell per frame (45 fps): a cell is a rectangle of an atlas with an anchor inside it
(`position`), drawn at a world point (`pivot`, y down) with a rotation (degrees) and scale. Cells named light* /
shine* glow (additive): the files don't say, but with it the sky matches the recordings (sky colour within a few
levels; without it 20-30 darker).

MEASURED on the Assault recordings (Assault Test Runs/akainu.mp4, the first clear frame after the boss intros,
10.147 s; canonical px = 0.8 x source + (108, 0) for 1080 x 2400): game px = world x SCALE + offset, SIFT fit of the
far layer (22 inliers, rotation 0.00 deg; the camera starts easing in right there: 1.057 -> 1.163 over 0.3 s), the
near layer's offset by template matching floor patches (score 0.74-0.86). The floor repeats every tile along its
strip, so that offset is only known to one tile: the one used is the only nearby one that keeps the rock spires out
of the opening view, as in the recordings.
"""
import json
import math
import os

import cv2

from game_ssd import FPS, load_atlases, read_ssd, render

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "Background Images")
OUT = os.path.join(ROOT, "public", "game-art", "assault")

SCALE = 1.057                    # world px -> game px (both layers)
FAR_T = (-201.5, 1271.8)         # far layer: game px = world x SCALE + FAR_T
NEAR_T = (-598.3, 1347.7)        # near layer
FIELD = (0, 300, 1080, 780)      # x, y, w, h in game px: the replay's field (Replay.tsx FIELD_ART)
GLOW = ("light", "shine")        # additive cells (by bone name)
WEBP_Q = 90


def lava_travel(frames: list[list[dict]]) -> tuple[float, float]:
    """How far the lava strips move in one loop (game px), from the first lava cell's path over the frames."""
    first = next(c for c in frames[0] if c["name"].startswith("water"))
    path = [next(c for c in f if c["bone"] == first["bone"]) for f in frames]
    n = len(frames)
    dx = (path[-1]["wx"] - path[0]["wx"]) / (n - 1) * n
    dy = (path[-1]["wy"] - path[0]["wy"]) / (n - 1) * n
    return dx * SCALE, dy * SCALE


def main() -> None:
    atlases = load_atlases([os.path.join(SRC, f"assaultrumble_arena_map_0{i}.png") for i in range(1, 7)])
    os.makedirs(OUT, exist_ok=True)
    layers = []
    for name, t in (("far", FAR_T), ("near", NEAR_T)):
        frames = read_ssd(os.path.join(SRC, f"assaultrumble_arena_map_01_{name}_01.ssd"))
        f0 = frames[0]
        lava = [c for c in f0 if c["name"].startswith("water")]
        rest = [c for c in f0 if not c["name"].startswith("water")]
        dx, dy = lava_travel(frames)
        period = len(frames) / FPS
        # the lava image reaches one loop's travel past the field on the side it comes from (it slides by up to
        # (dx, dy): it flows left and down, so it reaches further right and up)
        fx, fy, fw, fh = FIELD
        lx0, ly0 = fx - max(0, dx), fy - max(0, dy)
        lx1, ly1 = fx + fw - min(0, dx), fy + fh - min(0, dy)
        lrect = (int(math.floor(lx0)), int(math.floor(ly0)), int(math.ceil(lx1 - math.floor(lx0))), int(math.ceil(ly1 - math.floor(ly0))))
        for file, cells, rect, scroll in ((f"{name}-lava.webp", lava, lrect, dict(dx=round(dx, 2), dy=round(dy, 2), period=round(period, 4))),
                                          (f"{name}.webp", rest, FIELD, None)):
            img = render(cells, SCALE, t, rect, atlases, GLOW)
            cv2.imwrite(os.path.join(OUT, file), img, [cv2.IMWRITE_WEBP_QUALITY, WEBP_Q])
            layers.append(dict(href=f"assault/{file}", x=rect[0], y=rect[1], w=rect[2], h=rect[3], **({"scroll": scroll} if scroll else {})))
            print(f"{file}: {rect[2]}x{rect[3]} at ({rect[0]}, {rect[1]}), {len(cells)} cells" + (f", flows {dx:.1f}, {dy:.1f} px per {period:.2f} s" if scroll else ""))
    json.dump(dict(layers=layers, sprites=[]), open(os.path.join(OUT, "layout.json"), "w"), indent=1)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
