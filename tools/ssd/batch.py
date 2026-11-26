"""Batch-extract attack timings from every `.ssd` into tools/ssd/out/ssd_timings.csv.

One row per .ssd file (a unit can have several: the SD attack motion, `_evolved` variants,
and `_skill` special cut-ins). Columns:

    serverId, id, file, variant        variant = sd | evolved | skill | other (from the file name)
    name, unitSize, comboNum           from sakura.db MstCharacter_ (blank if not found)
    fps                                authored fps from the trailer (60 or 45)
    frames, duration_s                 frame count, frames / fps
    duration_s_at60                    frames / 60 (the game appears to play all motions at 60, see README)
    hits                               ';'-joined frames of UDAT "hit" events
    n_hits, first_hit                  count / first of those (blank when the file has no UDAT part)
    se_frames                          ';'-joined frames of hit sound events (UDAT_SE "se:...")
    first_se
    start, finish                      frames of UDAT "start" / "finish" events
    impact                             first_hit if present, else first_se: best guess for the
                                       frame the damage number appears (see README)
    impact_s                           impact / 60
    hold_from                          first frame of the final run of identical frames
                                       (the motion is over and the unit holds a pose)
    idle_from                          first frame where the `idoling` part is drawn (blank if none)
    other_events                       remaining user-data texts, 'frame:part:text', ';'-joined
    textures, parts, bytes             counts / file size
    error                              parse error, if any

Usage:
    python -I batch.py [--ssd-dir DIR] [--db sakura.db] [--out out/ssd_timings.csv] [--jobs 6]
Defaults point at the read-only master_db_tool folder next to the simulator repo.
"""
from __future__ import annotations

import csv
import os
import re
import sqlite3
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ssd  # noqa: E402

DEFAULT_ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'OPTC Decomp', 'master_db_tool'))

COLS = ['serverId', 'id', 'file', 'variant', 'name', 'unitSize', 'comboNum', 'fps', 'frames',
        'duration_s', 'duration_s_at60', 'hits', 'n_hits', 'first_hit', 'se_frames', 'first_se',
        'start', 'finish', 'impact', 'impact_s', 'hold_from', 'idle_from', 'other_events',
        'textures', 'parts', 'bytes', 'error']


def variant(fn: str) -> str:
    stem = fn[:-4]
    if stem.endswith('_skill'):
        return 'skill'
    if stem.endswith('_evolved'):
        return 'evolved'
    return 'sd' if re.match(r'^\d+_\d+_[^_]+', stem) else 'other'


def frame_sig(fr):
    return tuple((st.part, st.unk2, st.cell_x, st.cell_y, st.cell_w, st.cell_h, st.x, st.y, st.pivot_x,
                  st.pivot_y, st.alpha, st.flags_a, st.flags_b, st.flags_c, round(st.rotation, 3),
                  round(st.scale_x, 4), round(st.scale_y, 4)) for st in fr)


def analyse(path: str) -> dict:
    fn = os.path.basename(path)
    m = re.match(r'^(\d+)_(\d+)_', fn)
    row = {'serverId': m.group(1) if m else '', 'id': m.group(2) if m else '', 'file': fn,
           'variant': variant(fn)}
    try:
        s = ssd.parse(path)
    except Exception as e:  # noqa: BLE001
        row['error'] = str(e)[:200]
        return row
    hits, se, start, finish, other = [], [], [], [], []
    for e in s.events():
        t = e.text
        if e.part_name == 'UDAT' and t == 'hit':
            hits.append(e.frame)
        elif e.part_name == 'UDAT' and t == 'start':
            start.append(e.frame)
        elif e.part_name == 'UDAT' and t == 'finish':
            finish.append(e.frame)
        elif e.part_name == 'UDAT_SE' and t.startswith('se:'):
            se.append(e.frame)
        else:
            other.append(f'{e.frame}:{e.part_name}:{t}')
    sigs = [frame_sig(fr) for fr in s.frames]
    hold = len(sigs) - 1
    while hold > 0 and sigs[hold - 1] == sigs[-1]:
        hold -= 1
    idle = s.visible_frames('idoling')
    impact = hits[0] if hits else (se[0] if se else None)
    j = lambda xs: ';'.join(str(x) for x in xs)  # noqa: E731
    row.update(fps=s.fps, frames=s.frame_count, duration_s=f'{s.duration:.3f}',
               duration_s_at60=f'{s.frame_count / 60:.3f}', hits=j(hits),
               n_hits=len(hits) if hits else '', first_hit=hits[0] if hits else '',
               se_frames=j(se), first_se=se[0] if se else '', start=j(start), finish=j(finish),
               impact='' if impact is None else impact,
               impact_s='' if impact is None else f'{impact / 60:.3f}',
               hold_from=hold if s.frame_count else '', idle_from=idle[0] if idle else '',
               other_events=j(other)[:500], textures=len(s.textures), parts=len(s.parts),
               bytes=os.path.getsize(path), error='')
    return row


def main(argv):
    opts = dict(zip(argv[::2], argv[1::2]))
    ssd_dir = opts.get('--ssd-dir', os.path.join(DEFAULT_ROOT, 'motion_ssd'))
    db = opts.get('--db', os.path.join(DEFAULT_ROOT, 'sakura.db'))
    out = opts.get('--out', os.path.join(HERE, 'out', 'ssd_timings.csv'))
    jobs = int(opts.get('--jobs', 6))
    files = sorted(os.path.join(ssd_dir, f) for f in os.listdir(ssd_dir) if f.endswith('.ssd'))
    meta = {}
    if os.path.exists(db):
        con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
        for sid, name, size, combo in con.execute(
                'select serverId_, name_, unitSize_, comboNum_ from MstCharacter_').fetchall():
            meta[str(sid)] = (name, size, combo)
        con.close()
    with Pool(jobs) as pool:
        rows = pool.map(analyse, files, chunksize=8)
    for r in rows:
        name, size, combo = meta.get(r['serverId'], ('', '', ''))
        r.update(name=name, unitSize=size, comboNum=combo)
    rows.sort(key=lambda r: (int(r['serverId'] or 0), r['file']))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, COLS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in COLS})
    errs = [r for r in rows if r.get('error')]
    print(f'{len(rows)} files, {len({r["serverId"] for r in rows})} serverIds, {len(errs)} errors -> {out}')
    for r in errs[:20]:
        print('  ERROR', r['file'], r['error'])


if __name__ == '__main__':
    main(sys.argv[1:])
