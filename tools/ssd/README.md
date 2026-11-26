# tools/ssd: OPTC `.ssd` character animation decoder

Reads the game's SD "motion" files (the attack animations Rumble uses) to get attack
timings, and renders their frames as a proof that the format can be drawn.

Input data lives outside the repo (read-only, never copied in):
`../../../OPTC Decomp/master_db_tool/` with `motion_ssd/*.ssd`, `textures/*_reverse.png` and
`sakura.db`. Run Python with `-I`. Needs Pillow (render only).

| file | what |
|---|---|
| `ssd.py` | the decoder: `ssd.parse(path)` returns textures, frames (part records), the part tree, user-data events, fps. CLI: `python -I ssd.py <file.ssd> [--events] [--frames]` |
| `batch.py` | every `.ssd` to `out/ssd_timings.csv` (one row per file, keyed by serverId). `python -I batch.py [--jobs 6]`, ~5 min |
| `validate.py` | decoded timings vs times measured in Rumble videos (table below) |
| `render.py` | draws frames to PNG: `python -I render.py <file.ssd> <sheet.png> out/<name> <frame>... [--strip] [--scale 0.7]` |
| `out/` | git-ignored output (CSV, proof PNGs) |

## The format

A baked, per-frame dump of a SpriteStudio animation. No keyframes or curves: every frame
lists each drawn part with its cell and its transform, already composed through the part
tree. Little-endian:

```
u32 size (= file length - 4)
u16 texture_count, then texture_count x {u16 len, name}   e.g. motion_0144_kabaji_0001.png
u16 frame_count
frame_count x { u16 record_count, record_count x record }
  record = 38 bytes, then user_count x {14 bytes, u16 len, text}
    +0  u16 part        index into the part table
    +2  u16 unk2        0; 1 or 2 only on a few effect parts in 17 files (LIKELY blend mode)
    +4  u16 cell x, y, w, h   rectangle on the part's texture (w = h = 0: null part, draws nothing)
    +12 i16 x, y        position of the pivot, +y down, origin near the unit's feet
    +16 i16 pivot x, y  inside the cell, from its top-left
    +20 u8  alpha
    +21 u8  x3          unknown: 255 in 3 records out of 111 million, otherwise 0
    +24 f32 rotation    degrees
    +28 f32 scale x, y  negative = flipped (11.8 M records use this; there are no flip flags)
    +36 u16 user_count  0 or 1
u16 part_count, part_count x {u16 id, u16 parent, u16 texture, u16 len, name}
trailer 9 bytes: 00 00 00 00 <fps> 00 00 64 00
```

- **Clips vs parts:** `attack`, `attack_01..NN`, `idoling`, `effect_*` are **parts** (sprites or
  null groups) of one timeline, not separate clips. **One file = one clip**: the attack. It
  swaps between the `attack_NN` sprites, then usually settles on the `idoling` sprite and holds
  it (Cabaji: attack frames 0-90, idle pose held 91-124). `master_core` / `attack` / `effect_core`
  are null groups; `UDAT` / `UDAT_SE` / `UDAT_VOICE` are carriers for events: they draw a
  32x32 dummy cell at scale 0.01 and alpha 2, so a renderer should skip them.
- **Part table `texture` field** = which sheet the part's cells come from (Pacifista: body 0,
  beams and stars 1, smoke 2). Only sheet 0 was extracted (`*_reverse.png`), so effects on
  sheets 1+ cannot be drawn yet.
- **Records are in draw order** (later on top). Only parts present in a frame are drawn.
- **Events** (user data, frame-exact): on `UDAT`: `hit`, `start`, `finish`; on `UDAT_SE`:
  `se:S_hit_M.wav` (hit sound). Skill cut-ins use `se,<name>`, `vol_voice,...`, `pos_X,160`,
  `action_tap`, `knockback`, `[stop]`. The 14 bytes before each text were zero in all 61,736 items.
- **fps** (trailer byte 4): 60 in 3,977 files, 45 in 3,508 (almost all skill cut-ins plus 979 attack
  motions), 50/40/30 in 5. The 45-fps attack motions use exactly the same frame numbers
  as the 60-fps ones and the game appears to **play attacks at 60 regardless** (King below).
- Unknown: trailer bytes other than fps (constant), `unk2` meaning (blend guess), `x3`, the 14
  user-data bytes. None of them matter for attack timing.

### Hit frames

`hit` events count the attack's hits: number of `hit` events = `MstCharacter_.comboNum_` in
2,899 of 2,922 attack files that have them. Files without a `UDAT` part (old Pacifista,
Luffy 2087, Buggy) only have hit sounds; their sound count matches `comboNum_` in 1,723 of 1,762.
Attack motions come in a handful of shared templates:

| hits (frames) | hit sounds | length | files |
|---|---|---|---|
| 32 41 47 51 (start 31, finish 55) | 35 36 44 52 | 92 | ~890 (Robin, King) |
| 33 39 44 47 (start 32, finish 50) | 35 36 42 48 | 88 | ~1,100 (Usohachi) |
| none (sounds only) | 35 36 44 52 | 92 | ~500 (Pacifista, Luffy 2087) |
| none (sounds only) | 35 36 42 48 | 88 | ~130 |
| 15 20 ... (2 + 3 or 3 + 3 hits) | same frames, mostly | 101-125 | ~2,000 older units (Cabaji, Buggy, Luffy 1, Kizaru) |

Sound-only files with the 35/36/44/52 pattern are taken as the 32/41/47/51 template
(identical sounds), so their first hit is frame 32.

## Validation against Rumble video (`python -I validate.py`)

Model: **damage number = strip appears + C + first_hit / 60**, C fitted.
C = **0.121 s (sd 0.011 s, n = 5 units)**, i.e. about 7 frames: the animation starts about
0.12 s after the strip (0.32 s after arriving), or the number lags the hit by that much.

| unit (serverId) | fps | frames | clip s | 1st hit | predicted strip->number | measured | error |
|---|---|---|---|---|---|---|---|
| Cabaji (144) | 60 | 125 | 2.083 | 15 | 0.37 | 0.37 | -0.001 |
| Pacifista PX-4..5 (1199-1203) | 60 | 92 | 1.533 | 32 (template) | 0.65 | 0.67 | +0.015 |
| Luffy 2087 (10336) | 60 | 92 | 1.533 | 32 (template) | 0.65 | 0.66 | +0.005 |
| King 3137 (11680) | **45** | 92 | 1.533 at 60 | 32 | 0.65 | 0.64 | -0.015 |
| Robin 4375 (14418) | 60 | 92 | 1.533 | 32 | 0.65 | 0.65 (windup 0.85 - 0.2) | -0.005 |
| Buggy (41) | 60 | 101 | 1.683 | 15 (sound) | 0.37 | - | |
| Usohachi 2806 (11196) | 60 | 88 | 1.467 | 33 | 0.67 | - | |
| Kizaru 3704 (12808) | 60 | 116 | 1.933 | 15 | 0.37 | - | |
| Luffy (1) | 60 | 105 | 1.750 | 15 | 0.37 | - (not the Rumble Luffy) | |

- All errors are within one video frame (+-0.033 s at 30 fps). Using the first hit **sound** instead
  of the template hit for Pacifista gives 0.70 (error -0.03), still close, but the template fits better.
- King's file says 45 fps; at 45 fps his hit would land at 0.71 + C = 0.83 s, 0.19 s later than
  measured. At 60 fps it fits. So the game plays these at 60 fps whatever the trailer says.
- Pacifista arrival -> first number: 0.2 + 0.121 + 0.533 = 0.85 s (measured ~0.87).
- **Stay is not the clip length.** stay - clip: 0.80 s for the 92-frame units (2.33 - 1.533),
  0.86 for Usohachi (88), 0.95 Cabaji, 1.35 Buggy, 0.22 Kizaru (116 frames but stays only 2.15 s).
  `finish` events don't explain it either (Kizaru finish 80 = 1.33 s, Cabaji 85 = 1.42 s, both on
  the 15-family). Strip-up time minus clip is 0.70 (Pacifista) vs 0.95 (Cabaji). The stay is
  decided by the game, not by this file; the clip only fixes the hit times inside it.

## Batch (`out/ssd_timings.csv`)

7,491 files, 4,844 serverIds; **1 failure**: `23_22_sogeking_riverse-1.ssd` is a 22-byte text
placeholder (`sogeking_riverse dummy`), not an animation. Variants by file name: 3,801 `sd`
(attack), 1,108 `evolved` (attack of the evolved form), 2,580 `skill` (special cut-ins, 45 fps,
median 379 frames) and 2 other. Attack motions (sd + evolved): median 92 frames, 3,927 at
60 fps and 979 at 45. Columns are listed in `batch.py`'s docstring; `impact` / `impact_s` are the
best-guess first damage frame (first `hit`, else first hit sound). For the 35/36/44/52 sound-only
files use 32 (see above); `validate.py` does this, the CSV does not.

## Rendering feasibility

**Verdict: the attack animation renders fully from the data; idle is one held pose; damage
poses aren't in the `.ssd`.**

Proof frames (all in `out/`): `cabaji_attack_strip.png` (frames 0, 14, 16, 20, 24, 60, 68, 76, 80, 95:
wind-up, three slashes with the speed-line effect, idle), `cabaji_idle_f110.png`,
`buggy_attack_strip.png` (Bara-Bara split, legs fly at the target), `robin_attack_strip.png`
(giant-arm attack), `pacifista_attack_strip.png` (body only: beams are on sheet 1), and
`cabaji_idle_guess_strip.png` (see below).

What works: crop the cell from the sheet, scale about the pivot (negative scale = flip), rotate
about the pivot, put the pivot at (x, y), apply alpha, draw in record order. The positions are
already composed, so no part-tree maths is needed. All test units come out coherent.

Gaps:
1. **Sheets 1+ are missing.** 5,976 of 7,491 files reference 2 or more textures; the extractor
   kept only the first PNG of each `_reverse` package. Body sprites are on sheet 0 in every unit
   checked; beams, impacts and big effects are often on 1+. Fix: pull the other volumes
   (`DecryptNTY` returns one volume; a multi-volume unpacker for the texture packages is needed).
2. **Idle loop, walking, hit and KO poses are not in the `.ssd`.** The sheet has them (Cabaji: a
   4-cell idle row at y = 0 on the same 256x224 grid as the attack cells, plus knocked and crouch
   poses), but the `.ssd` uses only one idle cell. The cells and their timing come from somewhere
   else (the engine, or another volume of the package). For older grid-layout sheets the idle row
   can be guessed (`cabaji_idle_guess_strip.png`: 4 cells at (256 i, 0, 256, 224), pivot (128, 112));
   newer units use packed atlases (Robin: 92x199 cells at odd offsets), so guessing is unsafe there.
3. Rotation sign is assumed (positive = clockwise on screen); every rotation in the test units is
   0, +-90 or small, so it hasn't been checked against a clear case. `unk2` blend modes aren't applied.

### What a TypeScript port needs

- Per unit: the attack `.ssd` (median 65 KB, Cabaji 35 KB; a few huge ones up to 9 MB) and sheet 0
  (palette PNG, 140-210 KB). Ship the `.ssd` as is and parse it in the browser (about 80 lines:
  the layout above), or pre-convert to a compact per-frame array.
- Fields used: textures, part table (name, texture), per record: part, cell x/y/w/h, x, y,
  pivot x/y, alpha, rotation, scale x/y, and the event texts. Skip `UDAT*` parts and null cells.
- Drawing: Canvas2D `save / translate(x, y) / rotate / scale(sx, sy) / globalAlpha /
  drawImage(sheet, cx, cy, cw, ch, -px, -py, cw, ch) / restore` per record, one frame per 1/60 s.
  Mirror the whole unit for the enemy side with one extra `scale(-1, 1)`.
- Timing hook: drive damage numbers from `hit` frames (+0.12 s), and stop on the held idle pose
  until the game's stay ends.

## Open questions

1. Where do idle-loop / walk / damage / KO cell rectangles and timings come from?
2. What sets the stay (2.33 s for 92/88-frame units, 3.03 for Cabaji/Buggy, 2.15 for Kizaru)?
3. Is C = 0.12 s a delay before the animation starts or a lag before the number shows?
   A video frame where the attack sprite first changes would tell.
4. What does a Full attack (+0.75 s, 45 frames at 60 fps) play? There is only one attack clip
   per unit.
5. `unk2` (blend?), `x3`, the 14 user-data bytes and the constant trailer bytes.
