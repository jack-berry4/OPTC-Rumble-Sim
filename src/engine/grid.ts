import type { Side } from "./types";

export type Vec = { x: number; y: number };

/**
 * The battle field is a grid of tiles (MEASURED, videos 1-5, docs/HISTORY.md). Units rest on
 * tile centres, attack from a tile and come back to a tile.
 *
 * Your team's tiles: ORIGIN + i*U + j*W in game px (battle-start screen of a 1080x1920 recording). +i points toward
 * the enemy (right and slightly down on screen), +j toward the bottom of the screen (slightly left). The enemy's
 * grid is the same grid turned half a circle about the field centre, so the same (i, j) means the same thing for
 * both teams ("+i = toward the other team").
 */
export const GRID_ORIGIN: Vec = { x: 199, y: 645 };
export const GRID_U: Vec = { x: 86, y: 37 };
export const GRID_W: Vec = { x: -12, y: 51 };
/**
 * One tile: the length of one step along a row of the grid (|GRID_U| ~ 93.6 px). The game's battle data gives ranges
 * as plain numbers (radial specials 1.2 / 2.3 / 3.6, a Small heal 1.0); until told otherwise they are read as tiles
 * [A: the unit]. Change it here to rescale every range in tiles at once.
 */
export const TILE = Math.hypot(GRID_U.x, GRID_U.y);
/** Radial special ranges in tiles, from the game's battle data (2026-11-13): small 1.2, medium 2.3 [C data]; large
 *  3.6 [L: inferred, the file's "large" is not tied to a database size]. */
export const RADIAL_TILES = { small: 1.2, medium: 2.3, large: 3.6 } as const;
export const FIELD_CENTER: Vec = { x: 540, y: 668 };
/**
 * The field's edges for tiles (centres, px). Top edge MEASURED-ish: the highest tile ever used is y 580 (both teams);
 * the next one up (y 566) is never used, and an enemy on the top row can't be attacked from it (TUNING.needAttackTile).
 * The other edges are ASSUMED (tiles down to y ~860 are used).
 */
export const FIELD_BOUNDS = { x0: 40, x1: 1040, y0: 575, y1: 900 };

export interface Cell {
  i: number;
  j: number;
}

const DET = GRID_U.x * GRID_W.y - GRID_W.x * GRID_U.y;

export function cellPos(side: Side, c: Cell): Vec {
  const x = GRID_ORIGIN.x + c.i * GRID_U.x + c.j * GRID_W.x;
  const y = GRID_ORIGIN.y + c.i * GRID_U.y + c.j * GRID_W.y;
  return side === "atk" ? { x, y } : { x: 2 * FIELD_CENTER.x - x, y: 2 * FIELD_CENTER.y - y };
}

/** Grid coordinates of a point (not rounded). */
export function gridCoords(side: Side, p: Vec): { i: number; j: number } {
  const q = side === "atk" ? p : { x: 2 * FIELD_CENTER.x - p.x, y: 2 * FIELD_CENTER.y - p.y };
  const dx = q.x - GRID_ORIGIN.x;
  const dy = q.y - GRID_ORIGIN.y;
  return { i: (dx * GRID_W.y - dy * GRID_W.x) / DET, j: (GRID_U.x * dy - GRID_U.y * dx) / DET };
}

export const nearestCell = (side: Side, p: Vec): Cell => {
  const g = gridCoords(side, p);
  return { i: Math.round(g.i) + 0, j: Math.round(g.j) + 0 }; // +0: no -0
};

export function inField(p: Vec): boolean {
  const b = FIELD_BOUNDS;
  return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
}

/** Tiles of `side` around the point, nearest first (search radius in tiles). */
export function cellsNear(side: Side, p: Vec, radius = 3): Cell[] {
  const c0 = nearestCell(side, p);
  const out: { c: Cell; d: number }[] = [];
  for (let di = -radius; di <= radius; di++) {
    for (let dj = -radius; dj <= radius; dj++) {
      const c = { i: c0.i + di, j: c0.j + dj };
      const q = cellPos(side, c);
      if (!inField(q)) continue;
      out.push({ c, d: Math.hypot(q.x - p.x, q.y - p.y) });
    }
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.c);
}
