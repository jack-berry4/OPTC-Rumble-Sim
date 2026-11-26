"""
OPTC-DB unit thumbnails, downloaded once into .cache/thumbs/<id>.png (git-ignored), and the small portrait features
the screenshot import and the Nydato sheet sync match against.

    python -I scripts/portraits/thumbs.py            # download what's missing (all units in public/data/units-index.json)
    python -I scripts/portraits/thumbs.py --features # also write public/import/portraits.bin + portraits.json

Features (src/import/portraits.ts does the same on a screenshot's crop): the portrait's middle (BOX), resized to GRID x GRID by averaging, RGB, each channel normalized to mean 0 /
spread 1, stored as int8 (x 32, clamped). Compared by correlation (cosine).
"""
from __future__ import annotations

import warnings

warnings.filterwarnings("ignore")

import io
import json
import struct
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "thumbs"
#: scripts/db/split.ts writes the index under a version folder named in version.json
DATA = ROOT / "public" / "data"
INDEX = DATA / (json.loads((DATA / "version.json").read_text(encoding="utf-8"))["v"] if (DATA / "version.json").exists() else "none") / "units-index.json"
OUT_DIR = ROOT / "public" / "import"
HOST = "https://2shankz.github.io/optc-db.github.io/api/images/thumbnail/"
UA = "Mozilla/5.0 (compatible; rumble-sim-thumbs)"

GRID = 12
#: the part of a portrait compared (left, top, right, bottom as fractions): its middle, clear of the frame, the type
#: badge and "+574" at the top, the class icons at the sides and "Lv.120" at the bottom of the game's unit tiles
BOX = (0.22, 0.24, 0.80, 0.74)


def thumb_urls(uid: float) -> list[str]:
    base = int(uid)
    form = None if float(uid).is_integer() else str(uid).split(".")[1]
    folder = f"{base // 1000}/{(base % 1000) // 100}00"
    file = f"{base}-{form}" if form else str(base).zfill(4)
    return [f"{HOST}{r}/{folder}/{file}.png" for r in ("glo", "jap")]


def key(uid: float) -> str:
    return str(int(uid)) if float(uid).is_integer() else str(uid)


def fetch(uid: float) -> bool:
    out = CACHE / f"{key(uid)}.png"
    if out.exists():
        return True
    for url in thumb_urls(uid):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            if data[:4] == b"\x89PNG":
                out.write_bytes(data)
                return True
        except Exception:  # noqa: BLE001 - try the next region
            continue
    (CACHE / f"{key(uid)}.missing").write_text("")
    return False


def unit_ids() -> list[float]:
    """Every unit, plus each VS unit's combined id (4529 for 4529.1 / 4529.2): the box shows a VS unit as one combined
    portrait (both halves owned, stats shared; user 2026-11-22), so the import must recognize that picture too."""
    idx = json.loads(INDEX.read_text(encoding="utf-8"))
    ids = [u["id"] for u in idx["units"]]
    have = set(ids)
    combined = sorted({int(i) for i in ids if not float(i).is_integer()} - have)
    return ids + combined


def download_all(ids: list[float]) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    todo = [i for i in ids if not (CACHE / f"{key(i)}.png").exists() and not (CACHE / f"{key(i)}.missing").exists()]
    if not todo:
        return
    print(f"Downloading {len(todo)} thumbnails ...", flush=True)
    done = 0
    with ThreadPoolExecutor(16) as ex:
        for _ in ex.map(fetch, todo):
            done += 1
            if done % 250 == 0:
                print(f"  {done}/{len(todo)}", flush=True)


def features(img) -> "list[float]":
    """GRID x GRID x RGB of the portrait's inside, each channel normalized (see the module docs)."""
    import numpy as np
    from PIL import Image

    im = img.convert("RGB")
    w, h = im.size
    box = (round(w * BOX[0]), round(h * BOX[1]), round(w * BOX[2]), round(h * BOX[3]))
    im = im.crop(box).resize((GRID * 4, GRID * 4), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32).reshape(GRID, 4, GRID, 4, 3).mean(axis=(1, 3))
    a = (a - a.mean(axis=(0, 1))) / (a.std(axis=(0, 1)) + 1e-6)
    return a.reshape(-1)


ART_VARIANTS = ROOT / "public" / "game" / "art-variants.json"
#: the game's own icons of each art, when extracted (see docs/IMPORT_PLAN.md): <art id>.png
ART_ICONS = ROOT / ".cache" / "art-icons"


def variant_refs() -> list[tuple[float, Path]]:
    """Extra portraits for units drawn with several arts ("motion" characters, public/game/art-variants.json): each art
    is the same unit, so its picture is one more reference for that unit's id. OPTC-DB's "<id>-<n>.png" thumbnails
    where it has them, and the game's icons where they've been extracted."""
    if not ART_VARIANTS.exists():
        return []
    out: list[tuple[float, Path]] = []
    for u in json.loads(ART_VARIANTS.read_text(encoding="utf-8"))["units"]:
        uid = u["unitId"]
        folder = f"{uid // 1000}/{(uid % 1000) // 100}00"
        for n in range(1, len(u["arts"]) + 1):
            p = CACHE / f"{uid}-v{n}.png"
            if not p.exists() and not (CACHE / f"{uid}-v{n}.missing").exists():
                for r in ("glo", "jap"):
                    try:
                        req = urllib.request.Request(f"{HOST}{r}/{folder}/{uid}-{n}.png", headers={"User-Agent": UA})
                        with urllib.request.urlopen(req, timeout=20) as resp:
                            data = resp.read()
                        if data[:4] == b"\x89PNG":
                            p.write_bytes(data)
                            break
                    except Exception:  # noqa: BLE001 - not there: try the other region
                        continue
                else:
                    (CACHE / f"{uid}-v{n}.missing").write_text("")
            if p.exists():
                out.append((float(uid), p))
        for a in u["arts"]:
            icon = ART_ICONS / f"{a['id']}.png"
            if icon.exists():
                out.append((float(uid), icon))
    return out


def load_features(ids: list[float], variants: bool = True):
    """(ids that have a thumbnail, matrix of their features); a unit with several arts has a row per art."""
    import numpy as np
    from PIL import Image

    got, rows = [], []
    for uid, p in variant_refs() if variants else []:
        try:
            rows.append(features(Image.open(p)))
            got.append(uid)
        except Exception:  # noqa: BLE001 - a broken file: skip it
            continue
    for i in ids:
        p = CACHE / f"{key(i)}.png"
        if not p.exists():
            continue
        try:
            rows.append(features(Image.open(p)))
            got.append(i)
        except Exception:  # noqa: BLE001 - a broken file: skip it
            continue
    return got, np.stack(rows)


def write_features(ids: list[float]) -> None:
    import numpy as np

    got, m = load_features(ids)
    q = np.clip(np.round(m * 32), -127, 127).astype(np.int8)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "portraits.bin", "wb") as f:
        f.write(struct.pack("<III", len(got), GRID, 3))
        f.write(np.asarray(got, dtype=np.float32).tobytes())
        f.write(q.tobytes())
    (OUT_DIR / "portraits.json").write_text(json.dumps({"count": len(got), "grid": GRID, "box": BOX, "scale": 32}), encoding="utf-8")
    print(f"Wrote features for {len(got)} units ({(OUT_DIR / 'portraits.bin').stat().st_size // 1024} KB)")


def match(img, ids: list[float], mat, top: int = 3) -> list[tuple[float, float]]:
    """Best matches for an image: (unit id, correlation), best first."""
    import numpy as np

    f = features(img)
    sims = mat @ f / (np.linalg.norm(mat, axis=1) * np.linalg.norm(f) + 1e-6)
    order = np.argsort(-sims)[:top]
    return [(ids[k], float(sims[k])) for k in order]


def open_image(data: bytes):
    from PIL import Image

    return Image.open(io.BytesIO(data))


if __name__ == "__main__":
    ids = unit_ids()
    download_all(ids)
    if "--features" in sys.argv:
        write_features(ids)
