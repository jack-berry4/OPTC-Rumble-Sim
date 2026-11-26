"""Compare decoded .ssd timings with timings measured from Rumble gameplay video.

Measured values (docs/MECHANICS.md, video analysis):
  strip_to_number: attack strip appears -> first damage number (s)
  stay:            arrival -> take-off (s)
Model tested: number = strip + C + hit_frame / 60, with C fitted (mean of residuals).

Usage: python -I validate.py [--ssd-dir DIR]
"""
from __future__ import annotations

import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ssd  # noqa: E402
from batch import DEFAULT_ROOT, analyse  # noqa: E402

# name, file, strip->number (s) or None, stay (s) or None, note
UNITS = [
    ('Cabaji 144', '144_125_kabaji.ssd', 0.37, 3.03, 'Buggy team stay'),
    ('Buggy 41', '41_40_buggy.ssd', None, 3.03, 'Buggy team stay'),
    ('Pacifista PX-4 1199', '1199_1094_cgfjawz_red.ssd', 0.67, 2.33, ''),
    ('Pacifista PX-5 1203', '1203_1098_cgfjawz_black.ssd', None, 2.33, 'same file content as PX-4; not counted twice in the fit'),
    ('Luffy 2087 (sid 10336)', '10336_3234_tbugkw.ssd', 0.66, 2.33, ''),
    ('King 3137 (sid 11680)', '11680_4372_21n22l_evolved.ssd', 0.64, 2.33, 'file fps 45'),
    ('Robin 4375 (sid 14418)', '14418_5762_rkgswv.ssd', 0.65, 2.33, 'windup 0.85 from arrival - 0.2 strip delay'),
    ('Usohachi 2806 (sid 11196)', '11196_4013_6qeonw_evolved.ssd', None, 2.33, ''),
    ('Kizaru 3704 (sid 12808)', '12808_4976_gedotn.ssd', None, 2.15, 'crouch ~0.35'),
    ('Luffy 1', '1_1_luffy.ssd', None, None, 'not measured (2087 is the Rumble Luffy)'),
]
TEMPLATE_HITS = [32, 41, 47, 51]   # hits of the shared 92-frame template (Robin, King)
TEMPLATE_SE = [35, 36, 44, 52]


def main(argv):
    ssd_dir = argv[argv.index('--ssd-dir') + 1] if '--ssd-dir' in argv else os.path.join(DEFAULT_ROOT, 'motion_ssd')
    rows = []
    for name, fn, s2n, stay, note in UNITS:
        r = analyse(os.path.join(ssd_dir, fn))
        hits = [int(x) for x in r['hits'].split(';')] if r['hits'] else []
        se = [int(x) for x in r['se_frames'].split(';')] if r['se_frames'] else []
        src = 'hit'
        if hits:
            h = hits[0]
        elif se == TEMPLATE_SE:
            h, src = TEMPLATE_HITS[0], 'template (SE pattern 35/36/44/52 = hits 32/41/47/51)'
        else:
            h, src = (se[0] if se else None), 'first SE'
        rows.append((name, r, h, src, s2n, stay, note))
    res = [s2n - h / 60 for (_, _, h, _, s2n, _, _) in rows if s2n is not None and h is not None]
    C = st.mean(res)
    sd = st.stdev(res)
    print(f'Fitted C = {C:.3f} s (sd {sd:.3f}, n={len(res)}); model: number = strip + C + hit/60\n')
    hdr = f'{"unit":28} {"fps":>3} {"frames":>6} {"clip_s":>6} {"hit_f":>5} {"hit_s":>6} {"pred":>5} {"meas":>5} {"err":>6}  {"finish":>6} {"stay":>5} {"stay-clip":>9}'
    print(hdr)
    for name, r, h, src, s2n, stay, note in rows:
        clip = r['frames'] / 60
        pred = C + h / 60 if h is not None else None
        fmt = lambda v, w=5, p=2: f'{v:{w}.{p}f}' if v is not None else ' ' * (w - 1) + '-'  # noqa: E731
        print(f'{name:28} {r["fps"]:>3} {r["frames"]:>6} {clip:6.3f} {h if h is not None else "-":>5} '
              f'{fmt(h / 60 if h is not None else None, 6, 3)} {fmt(pred)} {fmt(s2n)} '
              f'{fmt(s2n - pred if s2n is not None else None, 6, 3)}  {r["finish"] or "-":>6} {fmt(stay)} '
              f'{fmt(stay - clip if stay else None, 9, 3)}')
        if src != 'hit' or note:
            print(f'{"":28}   hit source: {src}' + (f'; {note}' if note else ''))
    # alternative: King at its authored 45 fps
    k = next(r for r in rows if r[0].startswith('King'))
    print(f'\nKing at authored 45 fps: hit {k[2]} -> {k[2] / 45:.3f} s, residual {k[4] - k[2] / 45 - C:+.3f} s '
          f'(vs {k[4] - k[2] / 60 - C:+.3f} at 60 fps)')


if __name__ == '__main__':
    main(sys.argv[1:])
