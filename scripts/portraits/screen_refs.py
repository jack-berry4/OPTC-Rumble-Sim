"""
Screen fingerprints for the screenshot import (src/import/screenRefs.json): each game screen the import reads, told
apart by its title banner (a small grayscale fingerprint of the banner's text area, in the game's 640 x 960 frame).
Built from sample screenshots (the git-ignored Samples/ folder; only these fingerprints are committed).

    python -I scripts/portraits/screen_refs.py Samples/2026-11-22
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "import" / "screenRefs.json"
#: what each screen is recognized by: game-frame boxes (x0, y0, x1, y1) with a fingerprint size. Most screens have the
#: status bar on top and their title under it; the character pages have no status bar (title higher) and are told
#: apart by the button next to the title ("RUMBLE STATS" on the main page, "CO-OP CAPTAIN" on the Rumble page)
TITLE = [(100, 116, 290, 156), 40, 8]
TITLE_TOP = [(90, 34, 280, 72), 40, 8]
BUTTON_TOP = [(345, 34, 440, 72), 20, 8]
PARTS = {"attackEdit": [TITLE], "vs": [TITLE], "gpTeam": [TITLE], "box": [TITLE], "details": [TITLE_TOP, BUTTON_TOP], "rumbleDetails": [TITLE_TOP, BUTTON_TOP]}
#: sample file -> screen
SAMPLES = {
    "5": "attackEdit", "6": "vs", "7": "gpTeam", "8": "gpTeam",
    "9": "details", "10": "details", "11": "details", "12": "rumbleDetails", "13": "rumbleDetails",
}


def game(im: Image.Image) -> Image.Image:
    """The game's 2:3 frame, scaled to 640 x 960 (width-limited on phones, height-limited on wide screens)."""
    im = im.convert("RGB")
    w, h = im.size
    if w / h < 2 / 3:
        gh = w * 1.5
        box = (0, (h - gh) / 2, w, (h + gh) / 2)
    else:
        gw = h * 2 / 3
        box = ((w - gw) / 2, 0, (w + gw) / 2, h)
    return im.crop(tuple(round(v) for v in box)).resize((640, 960), Image.BILINEAR)


def fp(g: Image.Image, box, w, h) -> np.ndarray:
    a = np.asarray(g.crop(box).convert("L").resize((w, h), Image.BILINEAR), dtype=np.float32)
    return ((a - a.mean()) / (a.std() + 1e-6)).reshape(-1)


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "Samples" / "2026-11-22")
    shots: dict[str, list[Image.Image]] = {}
    for f, kind in SAMPLES.items():
        p = folder / f"{f}.webp"
        if p.exists():
            shots.setdefault(kind, []).append(game(Image.open(p)))
    video = folder / "box-scroll-by-level.mp4"
    if video.exists():
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "f.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "4", "-i", str(video), "-frames:v", "1", str(out)], check=True)
            shots["box"] = [game(Image.open(out))]
    refs = {}
    for kind, ims in shots.items():
        refs[kind] = [{"box": list(box), "w": w, "h": h, "fp": [round(float(x), 2) for x in np.mean([fp(g, box, w, h) for g in ims], axis=0)]} for box, w, h in PARTS[kind]]
    data = {"screens": refs}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data), encoding="utf-8")
    # check: every sample is closest to its own screen
    for kind, ims in shots.items():
        for g in ims:
            sc = {k: float(np.mean([fp(g, tuple(r["box"]), r["w"], r["h"]) @ np.array(r["fp"]) / len(r["fp"]) for r in parts])) for k, parts in refs.items()}
            best = max(sc, key=sc.get)
            print(f"{kind:14} -> {best:14} {sc[best]:.2f} (next {sorted(sc.values())[-2]:.2f})")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
