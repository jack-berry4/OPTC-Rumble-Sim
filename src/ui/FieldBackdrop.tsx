import { memo, useEffect, useState } from "react";
import { cellPos, inField, type Cell, type Vec } from "../engine/grid";
import type { Side } from "../engine/types";

/**
 * The replay field's background: the game's own battle map rebuilt from the game's art, plus a marker on every tile
 * a unit can stand on.
 *
 * - Pirate Rumble (and Grand Party): the market plaza. `scripts/build_field_art.py` builds it from the game's own
 *   layout file and atlases in "Background Images/" into `public/game-art/plaza/` (`layout.json`): the map's cells in
 *   the game's draw order, the crowd groups and torches swapping poses / flames on the game's 0.4 s loop.
 * - Assault Rumble: the lava field every season uses (user, 2026-11-25). `scripts/build_assault_art.py` builds it into
 *   `public/game-art/assault/`: the game's far and near layers as images, their lava strips flowing as in the game.
 *
 * Without them the field stays plain.
 *
 * Coordinates are game pixels at battle start (the grid's frame, see engine/grid.ts). Tile positions are where a
 * unit's HP bar sits; its feet are GROUND_DY lower.
 */

/** Feet below the HP bar at battle-start zoom (MEASURED, run 1: 140 for Buggy's crew, 181 for the taller Pacifistas). */
export const GROUND_DY = 145;

/** Start tiles (i, j) by slot 1-5, docs/SIMULATOR_HANDOFF.md section 3. */
const START: Record<Side, Cell[]> = {
  atk: [{ i: 1, j: -1 }, { i: 2, j: -1 }, { i: 3, j: -1 }, { i: 2, j: 0 }, { i: 0, j: 0 }],
  def: [{ i: 3, j: -1 }, { i: 2, j: -1 }, { i: 1, j: -1 }, { i: 0, j: 0 }, { i: 2, j: 0 }],
};

type Placed = { href: string; x: number; y: number; w: number; h: number };
interface Layout {
  /** One still image of the whole map, or: */
  image?: Placed;
  /**
   * Images drawn back to front; one with `scroll` slides by (dx, dy) over each `period` seconds and starts over (the
   * Assault map's flowing lava: the image repeats itself after one slide). An animated one shows its `frames` in turn,
   * `frameS` seconds each (an empty href: nothing that frame).
   */
  layers?: ((Placed & { scroll?: { dx: number; dy: number; period: number } }) | { name?: string; frames: Placed[]; frameS: number; phase?: number })[];
  /** Animated crowd members: frames shown in turn, `frameS` seconds each (each frame has its own spot). */
  sprites: { name: string; frames: { href: string; x: number; y: number; w: number; h: number }[]; frameS: number; phase?: number }[];
}

const ART = "game-art/";
/** The game's battle maps: Pirate Rumble's market plaza (also used for Grand Party) and Assault Rumble's lava field. */
export type FieldMap = "plaza" | "assault";
const LAYOUTS: Record<FieldMap, string> = { plaza: "layout.json", assault: "assault/layout.json" };
const layoutPromises = new Map<FieldMap, Promise<Layout | null>>();
function loadLayout(map: FieldMap): Promise<Layout | null> {
  let p = layoutPromises.get(map);
  if (!p) {
    p = fetch(ART + LAYOUTS[map])
      .then((r) => (r.ok ? (r.json() as Promise<Layout>) : null))
      .catch(() => null);
    layoutPromises.set(map, p);
  }
  return p;
}

function tiles(side: Side): { c: Cell; p: Vec; slot: number }[] {
  const out: { c: Cell; p: Vec; slot: number }[] = [];
  for (let i = -12; i <= 16; i++) {
    for (let j = -10; j <= 10; j++) {
      const p = cellPos(side, { i, j });
      if (!inField(p)) continue;
      const slot = START[side].findIndex((s) => s.i === i && s.j === j) + 1;
      out.push({ c: { i, j }, p: { x: p.x, y: p.y + GROUND_DY }, slot });
    }
  }
  return out;
}
const TILES = { atk: tiles("atk"), def: tiles("def") };

/** Clock for the crowd / lava animation (frozen when the system asks for reduced motion). */
function useAnimClock(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    const id = setInterval(() => setNow((performance.now() - t0) / 1000), 50);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export const FieldBackdrop = memo(function FieldBackdrop(props: {
  showTiles: boolean; animate: boolean;
  /** Tile markers' opacity, 0-1. */
  tileOpacity?: number;
  /** false: no map art, just the plain field color. */
  showArt?: boolean;
  /** Which battle map (default: Pirate Rumble's). */
  map?: FieldMap;
}) {
  const showArt = props.showArt ?? true;
  const map = props.map ?? "plaza";
  const [layout, setLayout] = useState<Layout | null>(null);
  useEffect(() => {
    let live = true;
    setLayout(null);
    void loadLayout(map).then((l) => live && setLayout(l));
    return () => {
      live = false;
    };
  }, [map]);
  const moving = !!layout && (layout.sprites.length > 0 || !!layout.layers?.some((l) => "frames" in l || l.scroll));
  const now = useAnimClock(showArt && props.animate && moving);

  return (
    <g className="backdrop" aria-hidden="true">
      {layout && showArt && (
        <>
          {layout.image && <image href={ART + layout.image.href} x={layout.image.x} y={layout.image.y} width={layout.image.w} height={layout.image.h} />}
          {layout.layers?.map((l, n) => {
            if ("frames" in l) {
              const f = l.frames[Math.floor(now / l.frameS + (l.phase ?? 0)) % l.frames.length]!;
              return f.href ? <image key={`l${n}`} href={ART + f.href} x={f.x} y={f.y} width={f.w} height={f.h} /> : null;
            }
            const f = l.scroll ? (now / l.scroll.period) % 1 : 0;
            return <image key={`l${n}`} href={ART + l.href} x={l.x + (l.scroll?.dx ?? 0) * f} y={l.y + (l.scroll?.dy ?? 0) * f} width={l.w} height={l.h} />;
          })}
          {layout.sprites.map((s, n) => {
            const f = s.frames[Math.floor(now / s.frameS + (s.phase ?? 0)) % s.frames.length]!;
            return <image key={n} href={ART + f.href} x={f.x} y={f.y} width={f.w} height={f.h} />;
          })}
        </>
      )}
      {props.showTiles && (props.tileOpacity ?? 1) > 0 && <g opacity={props.tileOpacity ?? 1}>{(["atk", "def"] as const).map((side) => (
        <g key={side} className={`bd-tiles bd-tiles-${side}`}>
          {TILES[side].map((t) => (
            <ellipse key={`${t.c.i},${t.c.j}`} cx={t.p.x} cy={t.p.y} rx={t.slot ? 22 : 14} ry={t.slot ? 9 : 6}
              className={t.slot ? "bd-tile bd-start" : "bd-tile"}>
              <title>{`${side === "atk" ? "Your" : "Enemy"} tile (${t.c.i}, ${t.c.j})${t.slot ? ` — slot ${t.slot} start` : ""}`}</title>
            </ellipse>
          ))}
        </g>
      ))}</g>}
    </g>
  );
});
