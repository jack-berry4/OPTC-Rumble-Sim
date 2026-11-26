"""Decoder for OPTC's `.ssd` character animation files (SD "motion" sprites).

The format is a baked, per-frame dump of a SpriteStudio-style animation: every frame
lists the parts drawn in that frame with their sprite-sheet cell and their transform
(already composed with the parent chain, i.e. in the animation's own space).
There are no keyframes or curves to interpolate: one record per drawn part per frame.

Layout (all little-endian), as reverse-engineered from the files (see README.md):

    u32   size                  file length - 4
    u16   texture_count         1..n (multi-sheet units, e.g. Pacifista = 3)
    texture_count x { u16 len, char[len] name }   e.g. "motion_0144_kabaji_0001.png"
    u16   frame_count           one clip per file; played at `fps` (60)
    frame_count x frame:
        u16   record_count
        record_count x record (38 bytes, then optional user data):
            +0  u16  part          index into the part table (tail)
            +2  u16  unk2          0 almost always; 1/2 on ~2.3k effect records in 17 files (white
                                   flashes, sparks, smoke): LIKELY blend mode (0 mix, 1 mul?, 2 add?)
            +4  u16  cell_x        sprite-sheet rectangle, pixels
            +6  u16  cell_y
            +8  u16  cell_w        0x0 for null (non-drawing) parts
            +10 u16  cell_h
            +12 i16  x             position, +y down (screen space), origin = unit's feet?
            +14 i16  y
            +16 i16  pivot_x       pivot inside the cell, pixels from the cell's top-left
            +18 i16  pivot_y
            +20 u8   alpha         0..255
            +21 u8   flags_a       UNKNOWN: 255 in 3 records of 111 M (skill files only), else 0
            +22 u8   flags_b       always 0
            +23 u8   flags_c       always 0
                                   (flips are NOT flags: they are negative scale_x / scale_y)
            +24 f32  rotation      degrees
            +28 f32  scale_x
            +32 f32  scale_y
            +36 u16  user_count    number of user-data items that follow this record
            user_count x { 14 bytes (UNKNOWN, zero in all 61,736 items), u16 len, char[len] text }
                user_count is 0 or 1 in every file. Text examples: "hit", "start", "finish"
                (on part UDAT), "se:S_hit_M.wav" (UDAT_SE), "se,<name>" / "vol_voice,.."
                (skill cut-ins), "knockback", "pos_X,160", "action_tap", "[stop]".
    u16   part_count
    part_count x { u16 id, u16 parent_id, u16 texture, u16 len, char[len] name }
        texture: index into the texture list for that part's cells (Pacifista: body 0,
        beams/stars 1, smoke 2). parent_id of `root` is 0 (itself).
    trailer (9 bytes): 00 00 00 00 <fps u8> 00 00 64 00
        byte 4 = fps as authored (60 for attack motions, 45 for skill cut-ins and a few
        attack motions); the rest is constant and unknown.

Usage:
    python -I ssd.py <file.ssd> [--frames] [--events]
"""
from __future__ import annotations

import struct
import sys
from dataclasses import dataclass, field

REC = struct.Struct('<HHHHHHhhhhBBBBfffH')  # 38 bytes
assert REC.size == 38


@dataclass
class UserData:
    raw: bytes          # 14 unknown bytes (zero in every sample inspected)
    text: str


@dataclass
class PartState:
    part: int
    unk2: int
    cell_x: int
    cell_y: int
    cell_w: int
    cell_h: int
    x: int
    y: int
    pivot_x: int
    pivot_y: int
    alpha: int
    flags_a: int
    flags_b: int
    flags_c: int
    rotation: float
    scale_x: float
    scale_y: float
    user: list = field(default_factory=list)

    @property
    def draws(self) -> bool:
        return self.cell_w > 0 and self.cell_h > 0


@dataclass
class Part:
    id: int
    parent: int
    texture: int
    name: str


@dataclass
class Event:
    frame: int
    part: int
    part_name: str
    text: str


@dataclass
class SSD:
    size: int
    textures: list
    frames: list            # list[list[PartState]]
    parts: list             # list[Part]
    trailer: bytes

    @property
    def frame_count(self) -> int:
        return len(self.frames)

    @property
    def fps(self) -> int:
        # trailer byte 4 is 60 in every file seen
        return self.trailer[4] if len(self.trailer) >= 5 else 60

    @property
    def duration(self) -> float:
        return self.frame_count / self.fps

    def part_name(self, i: int) -> str:
        return self.parts[i].name if 0 <= i < len(self.parts) else '?'

    def part_texture(self, i: int) -> int:
        return self.parts[i].texture if 0 <= i < len(self.parts) else 0

    def events(self) -> list:
        out = []
        for fi, fr in enumerate(self.frames):
            for st in fr:
                for u in st.user:
                    out.append(Event(fi, st.part, self.part_name(st.part), u.text))
        return out

    def cells(self) -> list:
        """Distinct sprite-sheet rectangles used: (texture, x, y, w, h) -> first part using it."""
        seen = {}
        for fr in self.frames:
            for st in fr:
                if st.draws:
                    seen.setdefault((self.part_texture(st.part), st.cell_x, st.cell_y, st.cell_w, st.cell_h),
                                    self.part_name(st.part))
        return seen

    def visible_frames(self, name: str) -> list:
        """Frames in which the named part is drawn (alpha > 0, non-empty cell)."""
        idx = [p.id for p in self.parts if p.name == name]
        return [fi for fi, fr in enumerate(self.frames)
                if any(st.part in idx and st.draws and st.alpha > 0 for st in fr)]


class SSDError(Exception):
    pass


def parse(data) -> SSD:
    if not isinstance(data, (bytes, bytearray)):
        with open(data, 'rb') as fh:
            data = fh.read()
    d = data
    if len(d) < 16 or struct.unpack_from('<I', d, 0)[0] != len(d) - 4:
        # e.g. 23_22_sogeking_riverse-1.ssd is a 22-byte text placeholder ("... dummy")
        raise SSDError(f'not an .ssd (size field does not match; starts {bytes(d[:24])!r})')
    p = 0
    try:
        size, ntex = struct.unpack_from('<IH', d, 0)
        p = 6
        textures = []
        for _ in range(ntex):
            n, = struct.unpack_from('<H', d, p); p += 2
            textures.append(d[p:p + n].decode('latin1')); p += n
        nf, = struct.unpack_from('<H', d, p); p += 2
        frames = []
        for _ in range(nf):
            nr, = struct.unpack_from('<H', d, p); p += 2
            recs = []
            for _ in range(nr):
                v = REC.unpack_from(d, p); p += 38
                st = PartState(*v[:17])
                for _ in range(v[17]):
                    raw = bytes(d[p:p + 14]); p += 14
                    n, = struct.unpack_from('<H', d, p); p += 2
                    st.user.append(UserData(raw, d[p:p + n].decode('latin1'))); p += n
                recs.append(st)
            frames.append(recs)
        npart, = struct.unpack_from('<H', d, p); p += 2
        parts = []
        for _ in range(npart):
            i, par, kind, n = struct.unpack_from('<HHHH', d, p); p += 8
            parts.append(Part(i, par, kind, d[p:p + n].decode('latin1'))); p += n
    except struct.error as e:
        raise SSDError(f'truncated/misparsed at offset {p}: {e}') from e
    trailer = bytes(d[p:])
    if size != len(d) - 4:
        raise SSDError(f'size field {size} != len-4 {len(d) - 4}')
    if len(trailer) != 9:
        raise SSDError(f'unexpected trailer length {len(trailer)}')
    return SSD(size, textures, frames, parts, trailer)


def summary(s: SSD) -> str:
    lines = [f'textures: {s.textures}',
             f'frames: {s.frame_count} @ {s.fps} fps = {s.duration:.3f} s',
             f'parts ({len(s.parts)}): ' + ', '.join(f'{p.id}:{p.name}<{p.parent}' + (f'[t{p.texture}]' if p.texture else '')
                                                    for p in s.parts),
             f'cells used: {len(s.cells())}',
             f'trailer: {s.trailer.hex(" ")}']
    return '\n'.join(lines)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    s = parse(sys.argv[1])
    print(summary(s))
    if '--events' in sys.argv:
        for e in s.events():
            print(f'  frame {e.frame:4d} ({e.frame / s.fps:6.3f} s) {e.part_name}: {e.text}')
    if '--frames' in sys.argv:
        for fi, fr in enumerate(s.frames):
            vis = [f'{s.part_name(st.part)}@({st.cell_x},{st.cell_y},{st.cell_w}x{st.cell_h})'
                   for st in fr if st.draws and st.alpha > 0 and not s.part_name(st.part).startswith('UDAT')]
            print(fi, ' '.join(vis))
