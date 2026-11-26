"""
Nydato's Rumble Sheet -> the app's default teams (credit: Nydato, "Nydato's Rumble Sheet",
https://docs.google.com/spreadsheets/d/1IvYZjjs9SAMF9L_Wj9ql-5hqg5tgcOVNYvfFZSKWroI).

Reads the sheet's public view (no sign-in): "2A. META TEAMS COMPS" (the ranked comps: tier, name, 5 starters + 3 bench,
shown as unit portraits), "2B. COMPS & SUBS" (each comp's units and its options and replacements, also portraits) and
"4A. CHARACTER TIER LIST" (the units on it: in Pirate Rumble the team generator only tries units the sheet mentions). Portraits are
matched to units against the OPTC-DB thumbnails (scripts/portraits/thumbs.py). Writes src/engine/nydato-comps.json:
every comp of tier SS and up becomes a default team (src/engine/defaultTeams.ts), the rest are templates for the team
generator. Only the comps and their subs are taken from the sheet (user, 2026-11-22: it's Nydato's work and opinions).
Also each tab's "Last Update" date: the generator adds every unit released on or after the oldest one, since the sheet
can't have rated them yet (user, 2026-11-24).

    python -I scripts/sync/nydato_sheet.py           # update from the sheet
    python -I scripts/sync/nydato_sheet.py --check   # print what would change, write nothing
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from datetime import date
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "portraits"))
import thumbs  # noqa: E402

SHEET = "https://docs.google.com/spreadsheets/d/1IvYZjjs9SAMF9L_Wj9ql-5hqg5tgcOVNYvfFZSKWroI"
GID_COMPS = "475890873"
GID_SUBS = "2096562606"  # 2B. COMPS & SUBS
GID_TIERS = "1585785245"  # 4A. CHARACTER TIER LIST
OUT = ROOT / "src" / "engine" / "nydato-comps.json"
IMG_CACHE = ROOT / ".cache" / "nydato"
UA = "Mozilla/5.0 (compatible; rumble-sim-sync)"
TIERS = ["OP", "SS", "S", "A", "B", "C", "D"]
#: below this correlation a portrait match is reported as unsure
SURE = 0.80


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def cells(row_html: str) -> list[tuple[str, list[str]]]:
    out = []
    for _attrs, c in re.findall(r"<td([^>]*)>(.*?)</td>", row_html, re.S):
        txt = html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
        imgs = re.findall(r'<img src="([^"]+)"', c)
        out.append((txt, imgs))
    return out


def tabs() -> list[tuple[str, str]]:
    """(gid, tab name) for every tab, from the sheet's public view."""
    page = get(f"{SHEET}/htmlview").decode("utf-8")
    out = re.findall(r'items\.push\(\{name: "([^"]*)"[^}]*gid: "(\d+)"', page)
    return list(dict.fromkeys((g, html.unescape(re.sub(r"\\x([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), n))) for n, g in out))


def last_update(page: str) -> str | None:
    """A tab's "Last Update: 24/11/2026" or "Last Update: 2026-11-18" as YYYY-MM-DD (None if it shows none)."""
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    m = re.search(r"(?i)last update[ds]?\s*:?\s*(\d{4})-(\d{1,2})-(\d{1,2})", text)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.search(r"(?i)last update[ds]?\s*:?\s*(\d{1,2})/(\d{1,2})/(\d{4})", text)
        if not m:
            return None
        d, mo, y = map(int, m.groups())  # the sheet writes day/month/year
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def portrait(url: str) -> bool:
    """Unit portraits are the big images (~89 px); the small ones are type / class icons."""
    m = re.search(r"=w(\d+)-h(\d+)$", url)
    return bool(m) and int(m.group(1)) >= 60


def read_comps(page: str) -> list[dict]:
    """2A: tier row, name row, then a row of 8 portraits (5 starters, 3 bench)."""
    comps, tier, name = [], None, None
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cs = cells(row)
        texts = [t for t, _ in cs if t and t != ","]
        pics = [u for _, imgs in cs for u in imgs if portrait(u)]
        if len(pics) >= 8 and name:
            comps.append({"tier": tier, "title": name, "images": pics[:8]})
            name = None
        elif texts and texts[0] in TIERS and len(texts) == 1:
            tier = texts[0]
        elif texts and tier and not pics and texts[0] not in ("MAIN", "SUB", "TIER"):
            name = " ".join(texts).strip()
    return comps


def read_options(page: str) -> dict[str, dict]:
    """
    2B: each comp starts with a row holding its name ("STR  • 力", "DEX FREE SPIRIT • 技 自由") and its 8 portraits; the
    portrait rows after it (until the next comp) are its "options and replacements". Name (lower case) -> {title,
    images, options}.
    """
    out: dict[str, dict] = {}
    cur = None
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cs = cells(row)
        texts = [t for t, _ in cs if t]
        pics = [u for _, imgs in cs for u in imgs if portrait(u)]
        head = next((t for t in texts if "•" in t), None)
        if head and len(pics) >= 8:
            title = re.sub(r"\s+", " ", head.split("•")[0]).strip()
            cur = {"title": title, "images": pics[:8], "options": []}
            out[title.lower()] = cur
        elif cur and pics:
            cur["options"].extend(u for u in pics if u not in cur["options"] and u not in cur["images"])
    return out


def main() -> int:
    check = "--check" in sys.argv
    print("Reading Nydato's Rumble Sheet ...", flush=True)
    page = get(f"{SHEET}/htmlview/sheet?headers=true&gid={GID_COMPS}").decode("utf-8")
    comps = read_comps(page)
    if not comps:
        print("No comps found: the sheet's layout may have changed.")
        return 1
    try:
        subs = read_options(get(f"{SHEET}/htmlview/sheet?headers=true&gid={GID_SUBS}").decode("utf-8"))
    except Exception as e:  # noqa: BLE001 - subs are optional
        print(f"(Couldn't read the comps & subs tab: {e})")
        subs = {}

    # 4A: every unit on the character tier list (for the team generator: only units the sheet mentions)
    try:
        tier_page = get(f"{SHEET}/htmlview/sheet?headers=true&gid={GID_TIERS}").decode("utf-8")
        tier_urls = [u for row in re.findall(r"<tr[^>]*>(.*?)</tr>", tier_page, re.S) for _, imgs in cells(row) for u in imgs if portrait(u)]
    except Exception as e:  # noqa: BLE001 - the tier list is optional
        print(f"(Couldn't read the tier list: {e})")
        tier_urls = []

    # every tab's "Last Update" (the tabs read above are fetched again: cheap, and keeps this step on its own)
    updated: dict[str, str] = {}
    try:
        for gid, name in tabs():
            try:
                d = last_update(get(f"{SHEET}/htmlview/sheet?headers=true&gid={gid}").decode("utf-8"))
            except Exception:  # noqa: BLE001 - a tab that won't load just has no date
                d = None
            if d:
                updated[name] = d
    except Exception as e:  # noqa: BLE001 - the dates are optional
        print(f"(Couldn't read the tabs' update dates: {e})")
    since = min(updated.values()) if updated else None

    # portraits -> units
    ids = thumbs.unit_ids()
    thumbs.download_all(ids)
    have, mat = thumbs.load_features(ids)
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    urls = sorted({u for c in comps for u in c["images"]} | {u for c in subs.values() for u in c["images"] + c["options"]} | set(tier_urls))

    def one(url: str):
        f = IMG_CACHE / (re.sub(r"[^A-Za-z0-9]", "", url[-40:]) + ".png")
        if not f.exists():
            for _ in range(3):
                try:
                    data = get(re.sub(r"=w\d+-h\d+$", "=w112-h112", url))
                    if data[:4] == b"\x89PNG":
                        f.write_bytes(data)
                        break
                except Exception:  # noqa: BLE001 - retry
                    continue
        if not f.exists():
            return url, None
        return url, thumbs.match(thumbs.open_image(f.read_bytes()), have, mat, 3)

    with ThreadPoolExecutor(8) as ex:
        found = dict(ex.map(one, urls))
    unsure = []

    def unit(title: str, u: str, option: bool = False):
        m = found.get(u)
        if not m:
            if not option:
                unsure.append((title, "image not downloaded"))
            return None
        (best, sim), (second, sim2) = m[0], m[1]
        if option and sim < SURE:
            return None  # not a unit portrait (other icons on the page): the sheet's portraits match at ~1.00
        if sim < SURE or sim - sim2 < 0.03:
            unsure.append((title, f"{best} ({sim:.2f}) vs {second} ({sim2:.2f})"))
        return best

    out = []
    for c in comps:
        sub = subs.pop(c["title"].lower(), None)
        units = [unit(c["title"], u) for u in c["images"]]
        options = [x for x in (unit(c["title"], u, True) for u in (sub["options"] if sub else [])) if x is not None and x not in units]
        out.append({"tier": c["tier"], "title": c["title"], "units": units, "options": list(dict.fromkeys(options))})
    # comps only on the comps & subs page (no tier): templates for the generator
    for sub in subs.values():
        units = [unit(sub["title"], u) for u in sub["images"]]
        options = [x for x in (unit(sub["title"], u, True) for u in sub["options"]) if x is not None and x not in units]
        out.append({"tier": "", "title": sub["title"], "units": units, "options": list(dict.fromkeys(options))})

    # the tier list's units (its other pictures, tier badges and icons, match nothing well: dropped)
    tier_list = list(dict.fromkeys(x for x in (unit("tier list", u, True) for u in tier_urls) if x is not None))
    print(f"{len(out)} comps: " + ", ".join(f"{c['tier']} {c['title']}" for c in out))
    print(f"{len(tier_list)} units on the character tier list")
    for name, d in updated.items():
        print(f"  {name}: last update {d}")
    if since:
        print(f"The generator also uses every unit released on or after {since}")
    for t, why in unsure:
        print(f"  unsure: {t}: {why}")
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
    data = {"source": "Nydato's Rumble Sheet", "url": SHEET, "updated": updated, "since": since, "comps": out, "tierList": tier_list}
    if old and all(old.get(k) == data[k] for k in ("comps", "tierList", "updated", "since")):
        print("No change.")
        return 0
    if check:
        print("(check only: nothing written)")
        return 10
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
