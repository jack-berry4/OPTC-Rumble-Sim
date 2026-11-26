"""
Assault Rumble seasons from the game's master database (OPTC Decomp master_db_tool/sakura.db) ->
src/engine/assault-seasons.json, which the app's "Load a boss team from the game" uses (src/engine/gameKit.ts turns
each boss into a boss of the editor: stats, kit, resistances, attack pattern).

Per season (MstAssaultRumbleEvent_): dates, the rules (text and data), its three boss teams, the trusty characters
(MstAssaultRumbleEventCharacterScore_). Per boss team: each Assault Lv's deck and HP / ATK / RCV multipliers
(MstAssaultRumbleEventEnemyLevel_); each deck (MstAssaultRumbleEnemyDeck_ -> MstPiratesNpcUser*) with its units:
the boss's own character row (not the playable unit), level, stats, special / ability levels and text, ability data,
resistances, attack pattern, target, tags, and the deck's additionalBehaviorCount_ (meaning unknown).

It also writes public/game/rumble-rules.json: every regular Pirate Rumble stage (MstPiratesArena_ /
MstPiratesArenaStage_: event title, stage kind, dates, the rules as text and data), for the app's rule sets (the rules
in effect today by default; src/engine/gameRules.ts converts them).

    python -I scripts/db/assault.py [path/to/sakura.db]
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = Path(os.environ.get("OPTC_GAME_DIR") or ROOT.parent / "OPTC Decomp" / "master_db_tool") / "sakura.db"
#: fetched by the app when the Assault loader opens (too big to bundle)
OUT = ROOT / "public" / "game" / "assault-seasons.json"
#: scripts/db/split.ts writes the index under a version folder named in version.json
DATA = ROOT / "public" / "data"
INDEX = DATA / (json.loads((DATA / "version.json").read_text(encoding="utf-8"))["v"] if (DATA / "version.json").exists() else "none") / "units-index.json"
UNITS = ROOT / "data" / "units.json"

COLORS = {1: "STR", 2: "DEX", 3: "QCK", 4: "PSY", 5: "INT"}
CLASSES = {1: "Fighter", 2: "Slasher", 3: "Striker", 4: "Shooter", 5: "Free Spirit", 6: "Driven", 7: "Cerebral", 8: "Powerhouse"}
STYLES = ["BAL", "ATK", "DEF", "RCV", "SPT", "DBF"]


def rows(c, sql, *a):
    cur = c.execute(sql, a)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def main() -> int:
    db = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DB
    if not db.exists():
        print(f"No game database at {db} (run the phone sync first). Skipped.")
        return 0
    c = sqlite3.connect(str(db))
    # OPTC-DB units by full name, for each boss's look (portrait, sprite)
    by_name: dict[str, float] = {}
    by_sub: dict[str, list[tuple[float, str]]] = {}
    by_char: dict[str, float] = {}
    if INDEX.exists():
        # newest first, so a fallback picks the latest version of a character
        for u in sorted(json.loads(INDEX.read_text(encoding="utf-8"))["units"], key=lambda u: -u["id"]):
            n = u["name"].lower()
            by_name.setdefault(n, u["id"])
            if " - " in n:
                by_sub.setdefault(n.split(" - ", 1)[1], []).append((u["id"], n.split(" - ", 1)[0]))
                by_char.setdefault(n.split(" - ", 1)[0], u["id"])
            for f in u.get("families") or []:
                for part in re.split(r"[()]", f.lower()):
                    if part.strip():
                        by_char.setdefault(part.strip(), u["id"])

    # OPTC-DB main-special max level per unit (fallback for bosses whose special isn't in MstAbility_)
    sp_levels: dict[int, int] = {}
    if UNITS.exists():
        for u in json.loads(UNITS.read_text(encoding="utf-8")).get("units", []):
            if u.get("specialLevels"):
                sp_levels[u["id"]] = u["specialLevels"]

    def effect_ids(ch: dict) -> tuple[int, int]:
        """The character's main-game special id, and the playable unit's (boss copies prefix it: 2411451 -> 11451)."""
        s = ch["skillEffectId_"] or 0
        return s, s % 100000

    def norm(x) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (x or "").lower()).strip()

    def look(ch: dict):
        """The OPTC-DB unit a game character looks like. A boss is its own game character (logbook -1); its server id
        ends in the server id of the playable form it copies (boss Kizaru 2412210 -> 12210 = the 6* Borsalino 3411, not
        the 5* Kizaru 3410; user 2026-11-24). Without that form: a playable unit with the same main-game special,
        rarity and subtitle (punctuation ignored; Akainu "Determination for the New Era" = Fleet Admiral Sakazuki 4217),
        else the same full name, else the same special and subtitle, else the same subtitle, else any unit with that
        special, else the newest unit of that character."""
        name, sub = (ch["name_"] or "").lower(), (ch["subName_"] or "").lower()
        full = f"{name} - {sub}" if sub else name
        # same subtitle and the same character (a shared subtitle like "Happy Halloween" needs the name too)
        word = name.split(":")[0].split()[0] if name.split() else name
        same_sub = next((i for i, n in by_sub.get(sub, []) if word in n), None)
        own = ch["logbookId_"] if ch["logbookId_"] and ch["logbookId_"] > 0 else None
        form = rows(c, "select logbookId_ from MstCharacter_ where serverId_=? and logbookId_>0", (ch["serverId_"] or 0) % 100000) if not own else []
        sp = rows(c, "select logbookId_, name_, subName_, rarity_, isRarityPlus_ from MstCharacter_ where skillEffectId_ in (?,?) and logbookId_>0 order by logbookId_", *effect_ids(ch))
        sp_sub = [r for r in sp if norm(r["subName_"]) == norm(sub)]
        same_rank = [r for r in sp_sub if (r["rarity_"], r["isRarityPlus_"]) == (ch["rarity_"], ch["isRarityPlus_"])]
        pick = lambda rs: next((r["logbookId_"] for r in rs if norm(word) in norm(r["name_"])), None) or (rs[0]["logbookId_"] if rs else None)
        return (own or (form[0]["logbookId_"] if form else None) or pick(same_rank) or by_name.get(full) or pick(sp_sub)
                or same_sub or pick(sp) or by_char.get(name) or by_char.get(name.split(":")[0].strip()))

    def special_max(ch: dict, base) -> int | None:
        """Max level of the main-game special: the potentials/sockets stat bonus scales with level / max (Fujitora: Lv
        6 of 8 -> 3/4 of it, matching his stats screen, user 2026-11-24)."""
        for sid in effect_ids(ch):
            r = rows(c, "select maxLevel_ from MstAbility_ where serverId_=?", sid)
            if r and r[0]["maxLevel_"]:
                return r[0]["maxLevel_"]
        return sp_levels.get(int(base)) if base else None
    tag_names = {r["serverId_"]: r["name_"] for r in rows(c, "select serverId_, name_ from MstCharacterTag_")}

    def char(sid):
        return rows(c, "select * from MstCharacter_ where serverId_=?", sid)[0]

    def unit(nc: dict) -> dict:
        ch = char(nc["characterId_"])
        base = look(ch)
        sp = rows(c, "select s.name_ as name, e.level_ as level, e.chargeIntervalTime_ as ct, e.description_ as text from MstPiratesActiveSkill_ s join MstPiratesActiveSkillEffect_ e on e.piratesActiveSkillId_=s.serverId_ where s.serverId_=? and e.level_=?", ch["piratesActiveSkillId_"], nc["piratesActiveSkillLevel_"])
        ab = rows(c, "select level_ as level, description_ as text, dataJson_ as data from MstPiratesPassiveSkillEffect_ where piratesPassiveSkillId_=? and level_=?", ch["piratesPassiveSkillId_"], nc["piratesPassiveSkillLevel_"])
        rs = rows(c, "select description_ as text, dataJson_ as data from MstPiratesAbility_ where serverId_=?", ch["piratesAbilityId_"])
        beh = json.loads(ch["piratesBehaviorPatternsJson_"] or '{"data":[]}')["data"]
        tags = [tag_names.get(r["characterTagId_"]) for r in rows(c, "select characterTagId_ from MstCharacterTagRelation_ where characterId_=?", ch["serverId_"])]
        pot = sum(nc[f"potentialSkill{i}Level_"] or 0 for i in (1, 2, 3))
        sock = sum(nc[f"optionSkill{i}Plus_"] or 0 for i in (1, 2, 3, 4, 5) if nc[f"optionSkill{i}Id_"])
        return {
            "name": ch["name_"], "subName": ch["subName_"], "serverId": ch["serverId_"], "group": ch["groupId_"], "baseId": base,
            "color": COLORS.get(ch["attributeId_"]), "classes": [CLASSES[x] for x in (ch["characterType_"], ch["subCharacterType_"]) if x in CLASSES],
            "style": STYLES[ch["piratesStyle_"]] if 0 <= (ch["piratesStyle_"] or 0) < len(STYLES) else "BAL",
            "tags": [t for t in tags if t],
            "level": nc["level_"], "skillLevel": nc["skillLevel_"], "specialMax": special_max(ch, base), "potentialsAndSockets": pot + sock,
            "stats": {"hp": nc["stamina_"], "atk": nc["attack_"], "rcv": nc["healing_"], "def": ch["piratesDefense_"], "spd": ch["piratesSpeed_"]},
            "plus": {"hp": nc["plusStamina_"], "atk": nc["plusAttack_"], "rcv": nc["plusHealing_"]},
            "special": {**sp[0], "text": re.sub(r"<col=\d+>", "", sp[0]["text"])} if sp else None,
            "ability": {"level": ab[0]["level"], "text": ab[0]["text"], "data": json.loads(ab[0]["data"] or "null")} if ab else None,
            "resist": {"text": re.sub(r"<col=\d+>", "", rs[0]["text"]), "data": json.loads(rs[0]["data"] or "null")} if rs else None,
            "pattern": beh[0]["behavior_ids"] if beh else [],
            "target": beh[0].get("target_type", 3) if beh else 3,
        }

    def deck(npc_id: int) -> dict:
        d = rows(c, "select * from MstAssaultRumbleEnemyDeck_ where piratesNpcUserId_=?", npc_id)
        units = rows(c, """select nc.*, dc.position_ as pos from MstPiratesNpcUserPiratesDeck_ d
            join MstPiratesNpcUserPiratesDeckCharacter_ dc on dc.piratesNpcUserPiratesDeckId_=d.serverId_
            join MstPiratesNpcUserCharacter_ nc on nc.serverId_=dc.piratesNpcUserCharacterId_
            where d.piratesNpcUserId_=? order by dc.position_""", npc_id)
        return {"additionalBehaviors": d[0]["additionalBehaviorCount_"] if d else 0, "units": [unit(u) for u in units]}

    seasons, decks = [], {}
    for ev in rows(c, "select * from MstAssaultRumbleEvent_ order by id_"):
        rule = json.loads(ev["effectsJson_"] or "{}")
        bosses = json.loads(ev["assaultRumbleBossIdSequencesJson_"] or "[]")
        teams = []
        for b in bosses:
            lv = rows(c, "select level_, staminaCoefficient_, attackCoefficient_, healingCoefficient_, assaultRumbleEnemyDeckId_ from MstAssaultRumbleEventEnemyLevel_ where assaultRumbleEventId_=? and assaultRumbleBossId_=? order by level_", ev["id_"], b)
            levels = [{"level": r["level_"], "deck": r["assaultRumbleEnemyDeckId_"], "hp": r["staminaCoefficient_"], "atk": r["attackCoefficient_"], "rcv": r["healingCoefficient_"]} for r in lv]
            for l in levels:
                if l["deck"] not in decks:
                    decks[l["deck"]] = deck(l["deck"])
            lead = decks[levels[0]["deck"]]["units"][0] if levels and decks[levels[0]["deck"]]["units"] else None
            teams.append({"boss": b, "name": lead["name"] if lead else f"Boss {b}", "group": lead["group"] if lead else None, "levels": levels})
        trusty = []
        for r in rows(c, "select characterId_, coefficient_ from MstAssaultRumbleEventCharacterScore_ where assaultRumbleEventId_=?", ev["id_"]):
            ch = char(r["characterId_"])
            trusty.append({"unitId": look(ch), "name": ch["name_"], "coef": float(r["coefficient_"])})
        seasons.append({
            "id": ev["id_"], "start": ev["startAt_"], "end": ev["endAt_"],
            "rulesText": rule.get("description", ""), "rules": rule.get("data", []),
            "teams": teams, "trusty": trusty,
        })
    data = {"source": "game master database (MstAssaultRumble*)", "seasons": seasons, "decks": {str(k): v for k, v in decks.items()}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # regular Pirate Rumble stages and their rules
    arenas = {r["serverId_"]: r["title_"] for r in rows(c, "select serverId_, title_ from MstPiratesArena_")}
    stages, used_tags = [], set()
    for st in rows(c, "select * from MstPiratesArenaStage_ order by startAt_, id_"):
        eff = json.loads(st["effectsJson_"] or "{}")
        for d in eff.get("data", []):
            for t in (d.get("target") or {}).get("character_tags", []) or []:
                used_tags.add(t)
        stages.append({
            "id": st["id_"], "arena": st["piratesArenaId_"], "title": arenas.get(st["piratesArenaId_"], ""),
            "kind": str(st["stageType_"]).split("::")[-1], "num": st["stageNum_"], "start": st["startAt_"], "end": st["endAt_"],
            "text": eff.get("description", ""), "rules": eff.get("data", []),
        })
    rules_out = OUT.parent / "rumble-rules.json"
    rules_out.write_text(json.dumps({"source": "game master database (MstPiratesArenaStage_)", "tags": {str(t): tag_names.get(t) for t in sorted(used_tags)}, "stages": stages}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(stages)} Pirate Rumble stages ({rules_out.stat().st_size // 1024} KB) to {rules_out.relative_to(ROOT)}")
    # "Motion" (immersive) characters: one unit drawn with several arts the player picks (Luffy & Zoro & Sanji: 7,
    # Luffy & Bonney: 3; user 2026-11-23). Every art is the same unit: the box import treats each art as that unit.
    variants: dict[int, dict] = {}
    for r in rows(c, "select i.serverId_ as art, i.characterId_ as cid, i.immersiveIllustCharacterIdsJson_ as parts, i.characterIconFileName_ as icon, ch.logbookId_ as unit, ch.name_ as name from MstImmersiveIllust_ i join MstCharacter_ ch on ch.serverId_ = i.characterId_ order by i.serverId_"):
        v = variants.setdefault(r["unit"], {"unitId": r["unit"], "serverId": r["cid"], "name": r["name"], "arts": []})
        v["arts"].append({"id": r["art"], "parts": json.loads(r["parts"] or "[]"), "icon": r["icon"]})
    art_out = OUT.parent / "art-variants.json"
    art_out.write_text(json.dumps({"source": "game master database (MstImmersiveIllust_)", "units": list(variants.values())}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(variants)} units with several arts to {art_out.relative_to(ROOT)}")
    print(f"Wrote {len(seasons)} Assault Rumble seasons, {len(decks)} boss decks ({OUT.stat().st_size // 1024} KB) to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
