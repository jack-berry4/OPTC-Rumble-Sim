# Tags, colors, classes, styles and named characters (simulator v3)

Audit of 2026-11-13. Code: `matchesToken` / `hasTag` / `hasFamily` in `src/sim/battle.ts`; checked for every kit by
`scripts/check-effects.ts` (0 findings).

## Where tags come from

- `scripts/import-data.ts` reads `common/data/tags.js` from the 2Shankz optc-db fork into each unit's `tags`
  (`src/data/generated/optcdb-units.json`, last full import 2026-11-05).
- Compared with today's `tags.js`: **3,209 of 4,665 Rumble units have no tags** in our data; the source has 3,208.
  The one difference is 3349 Ace & Sabo, tagged in the source since our import (the next full import picks it up).
  605 units are 6*; 8 of them have no tags in the source either (the five Hime Turtles, 3349 until re-imported, 4212,
  5014). So "older units have no tags" matches the source; nothing is lost on import.
- 129 different tags are in use. The database merges some of the game's tags with a qualifier:
  `Former / Navy`, `Former / Royalty`, `Former / Seven Warlords of the Sea`, `Former / Whitebeard Pirates`,
  `Former / Roger Pirates`, `Former / Baroque Works`, and the Devil Fruit types `Logia-type / Devil Fruit User`,
  `Paramythia-type / Devil Fruit User`, `Zoan-type / ...`, `Mythical Zoan-type / ...`, `Ancient Zoan-type / ...`.
  The kits and the site's text say `[Navy]`, `[Royalty]`, `[Logia-type]` ...
- Tags are separate from character families (names). Older units mostly target / depend on named characters, newer
  ones on tags (user, 2026-11-13).
- **VS units** (user, 2026-11-13): in Rumble you pick one half, a separate Rumble unit (3135.1 Kaido / 3135.2 Big Mom).
  Only that half's tags, classes and color count. Classes and color come per form from `units.js` ("3135-1"); tags
  per form since 2026-11-13 (`tagsOf` in `import-data.ts`; the 19 affected form units were patched in the generated
  file from that day's `tags.js`). Families: `families.js` has one list per unit, so `import-data.ts`
  (`VS_FAMILY_SPLIT`) splits it by hand into each form's `ownFamilies` (4529.2 Nusjuro: "Saint Ethanbaron V.
  Nusjuro", "St. Ethanbaron V. Nusjuro"). "When Zoro is on your crew" and "to Zoro crew members" use `ownFamilies`
  only, so 4529.2 does not count as Zoro. `families` keeps both halves' names, because the other half still counts
  for the "same character can't be on a team twice" rule: Zoro vs Lucci and Zoro vs Nusjuro can't share a team
  (`clashReason` in `src/engine/team.ts`, unchanged). The 36 form units in `optcdb-units.json` were patched with
  `ownFamilies` the same way (no re-import).
- **Dual units** (one Rumble unit, e.g. 1985 Luffy & Ace) use their dual (combined) form's tags and classes (user).
  The database stores no separate list for the combined form, only one per character, so the unit gets both lists
  together; its classes are the parent row's in `units.js`; no color.

## How a target / condition token is read

| Token in the data | Means |
|---|---|
| `[STR]` `[DEX]` ... | color (dual units have none) |
| `Slasher`, `[Free Spirit]` | class |
| `ATK-Style` | Rumble style |
| `[Navy]`, `[Logia-type]`, `Giant` | tag: equal to a stored tag, or to one of its ` / ` parts. Exact parts only: `[Giant]` is not `Ancient Giant` / `Giant Pirate Crew` (user); `[Zoan-type]` is not `Mythical Zoan-type` or `Ancient Zoan-type`, three separate tags (user, 2026-11-13); `[Navy]` is not `Navy Admiral` (every admiral also has `Former / Navy`). `[Navy]` and the database's `Former / Navy` are the same tag: go by the database (user, 2026-11-13); `[World Government]` is a different tag |
| `[PSY] [Straw Hat Pirates]`, `[PSY] Powerhouse`, `DEF-Style [Straw Hat Pirates]` | **all** of them (the site: "to [PSY] [Straw Hat Pirates] crew members") |
| `Cerebral/Free Spirit [Straw Hat Pirates]` | (Cerebral or Free Spirit) and Straw Hat |
| `[Elbaph Arc], [Straw Hat Pirates]`, `Powerhouse, Fighter` | either (a comma list in one token, as the site writes it) |
| separate tokens `["[PSY]", "[Straw Hat Pirates]"]` | either ("to [PSY] and [Straw Hat Pirates] crew members") |
| `Cerebral enemies`, `[INT] enemies` | the class / color; the word only names the side |
| `[Ancient Zoan-type` (missing `]`) | tolerated |
| `families: ["Edward Newgate (Whitebeard)"]` | a named character: either part of "X (Y)", accents and dots ignored, against the unit's families (a VS form: its own half's, `ownFamilies`) or short name (`Senor Pink` = `Señor Pink`, `Kuween` = unit Kuween, family `Kyuin`). `Building Snake` and `Howling Gabu` (Shanks 4011) have no unit |
| `targets: ["crew"], families: ["Broggy"]` | **only** Broggy ("to Broggy crew member"); `crew` alone is the whole crew |
| `families: ["[Vegapunk]"]` (4544) | the tag |

## Crew counts in conditions

| Data | Site text | Counts |
|---|---|---|
| `composition: true` | "When there is 5 or more [Navy] crew members" | the whole team as built: all 8, bench and KO'd included; never changes, rumble-outs included (user, 2026-11-13) |
| no `composition` | "When there is 7 or more crew members remaining" | every unit not KO'd, **bench included** (and Forced Out) (user, 2026-11-13) |
| 4114 / 4115 | "When there is 6 or remaining crew members remaining" | a typo for 6 or **more** remaining (in game: "if the current team is 6 teammates or more", user); the data's `comparator: "remaining"` (6 or fewer) is patched to `more` in `src/data/patches.ts` |
| `relative`, a count | "3 or more enemies than your crew remaining" | remaining enemies minus remaining crew |
| `relative`, no count, `more` | "more crew members remaining than enemies" | at least 1 more |
| `character` | "When Shanks is on your crew" / "on the enemy team" | that character anywhere on that team: field, bench, Forced Out or KO'd (user, 2026-11-13; it was the field only until then), not the unit itself; the data writes the side as `enemies` or `enemy` |

Units KO'd by a rumble-out (every field unit Forced Out) give nobody credit: no "defeated" triggers, not counted for
"after N defeats" (user, 2026-11-13).

`check-effects.ts` confirms in every kit that `composition` is set exactly where the site doesn't say "remaining".

## Bugs fixed on 2026-11-13 (all could move win rates)

1. Tags stored with a qualifier never matched: `[Royalty]`, `[Seven Warlords of the Sea]`, `[Whitebeard Pirates]`,
   `[Roger Pirates]`, `[Baroque Works]`, `[Logia-type]`, `[Paramythia-type]`, `[Zoan-type]`, `[Mythical Zoan-type]`,
   `[Ancient Zoan-type]` matched no unit (about 2,000 effect lines). `[Navy]` worked through a special case.
2. Several names in one token (`[PSY] [Straw Hat Pirates]`, `[PSY] Powerhouse`, `[QCK] [Logia-type]`), `[Free Spirit]`
   in brackets, `[INT] enemies` / `[PSY] enemies` matched no unit; `[Elbaph Arc], [Straw Hat Pirates]` matched only
   Elbaph; `Powerhouse, Fighter` counted only Fighters.
3. `targets: ["crew"]` next to a named character hit the whole crew (32 effects, e.g. "Lv. 8 ATK to Broggy").
4. Kit spellings of characters that differ from the database's families matched nobody (`Edward Newgate (Whitebeard)`,
   `Marshall D. Teach (Blackbeard)`, `Charlotte Linlin (Big Mom)`, `Lao G.`, `Senor Pink`, `Don Krieg` ...).
5. "N crew members remaining" counted only the field (and Forced Out), so "7 or more ... remaining" could never hold
   and "3 or less ... remaining" turned on during every bench wait; it now counts everyone not KO'd.
6. "more crew members remaining than enemies" (no count) was true when the numbers were equal.
7. "When Roronoa Zoro is on the enemy team" (`team: "enemy"`, VS unit 4529) looked at its own crew.
8. VS form units carried both characters' tags (import, above).

Effect on the test teams (600 seeds each, before / after): test run 1 28.5% / 28.5%; **test run 9 61% / 44-47%**,
almost all from fix 1: the opponent's Nusjuro (4529.2) special part "5 or more [Navy], [World Government] and
[Zoan-type] crew members: 4x ATK to 3 enemies" now goes off. Run 9's opening buff levels (appendix A) are unchanged
and still match the recording. In 300 random 8v8 battles 67 changed winner or length.

## The user's answers, applied the same day

Confirmed as already done: `[Zoan-type]` / `[Mythical Zoan-type]` / `[Ancient Zoan-type]` separate; "remaining" counts
the bench, `composition` the whole team; `[Navy]` = `Former / Navy`; nobody is credited with rumble-out KOs; VS
forms' own tags, classes and color. Changed: "When X is on your crew" counts X anywhere on the team; VS forms' own
families (`ownFamilies`) for conditions and targets; 4114 / 4115 "6 or more remaining". Effect on the test teams
(1,000 seeds, together with the Evade changes in SIMULATOR.md): run 9 40.0% -> 40.6%, run 8 70.9% -> 70.9%, run 1
27.0% -> 27.0%.
