import type { UnitInfo } from "./Tracker";
import { SvgThumb } from "./UnitThumb";

/**
 * The end of a battle, from your (attacking) side, in screen units (the HUD's 1000 x 740 frame), with the game's own
 * art (public/game-ui/: the result logos, the parchment scroll of its "match decided" banner with the English client's
 * MATCH SET!! logo on it: until 2026-11-25 "BATTLE OVER!!" was written there, the art then being the Japanese client's).
 * The game's glow behind WIN!! is left out: it read as a stray cloud (user).
 *
 * - Pauses on: the battle clock stops for END_DUR while the field dims, the scroll unrolls with MATCH SET!!, then
 *   WIN!! or LOSE... drops in, then a result card slides up: both teams' portraits (KO'd units in
 *   greyscale), units left and damage dealt.
 * - Pauses off: WIN!! / LOSE... pops in over a lightly dimmed field with the reason and time under it.
 * Both stay up once the battle has ended.
 */
export const END_DUR = 3.4;
const UI = "game-ui/";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

export interface EndUnit { uid: string; side: "atk" | "def"; alive: boolean; damageDealt: number }

export function BattleEndOverlay(props: {
  win: boolean; reason: "wipe" | "timeout"; time: number; units: EndUnit[]; info: Map<string, UnitInfo>;
  width: number; height: number;
  /** Seconds into the ending (pauses on); undefined = the short ending (pauses off). */
  el?: number;
}) {
  const { win, width: W, height: H } = props;
  const full = props.el !== undefined;
  const el = props.el ?? 99;
  const why = props.reason === "wipe" ? (win ? "All enemies defeated" : "Your team was defeated") : "Time out";
  const sub = `${why} · ${props.time.toFixed(1)}s`;

  // logo: WIN!! 324 x 122 / LOSE... 356 x 108, drawn 1.35x
  const logo = win ? { href: "pirates_arena_result_txt_win.png", w: 324, h: 122 } : { href: "pirates_arena_result_logo_lose.png", w: 356, h: 108 };
  const k = 1.35, lw = logo.w * k, lh = logo.h * k;

  if (!full) {
    const cy = H * 0.42;
    return (
      <g className="battle-end" pointerEvents="none">
        <rect width={W} height={H} className="battle-end-veil light" />
        <g transform={`translate(${W / 2},${cy})`}>
          <g className="battle-end-pop">
            <image href={`${UI}${logo.href}`} x={-lw / 2} y={-lh / 2} width={lw} height={lh} />
          </g>
          <text y={lh / 2 + 46} className="battle-end-sub">{sub}</text>
        </g>
      </g>
    );
  }

  // 0 - 1.3 s: the scroll with MATCH SET!! (pirates_arena_battle_end.ssd: the logo 0.97 x the scroll's scale, 27 art px
  // above its middle)
  const scrollIn = easeOut(clamp01(el / 0.35));
  const scrollOut = clamp01((el - 1.15) / 0.2);
  // 1.3 s on: the logo drops in, then moves up for the result card at 2.2 s
  const logoP = clamp01((el - 1.3) / 0.25);
  const up = easeOut(clamp01((el - 2.2) / 0.4));
  const logoScale = logoP < 1 ? 1.7 - 0.7 * easeOut(logoP) : 1;
  const logoY = H * 0.4 - up * (H * 0.4 - 150);
  const cardP = easeOut(clamp01((el - 2.3) / 0.45));
  const sw = 522 * 1.3, sh = 145 * 1.3;
  return (
    <g className="battle-end" pointerEvents="none">
      <rect width={W} height={H} className="battle-end-veil" opacity={clamp01(el / 0.4)} />
      {scrollOut < 1 && (
        <g transform={`translate(${W / 2},${H * 0.42}) scale(${scrollIn},1)`} opacity={1 - scrollOut}>
          <image href={`${UI}pirates_arena_battle_end_scroll.png`} x={-sw / 2} y={-sh / 2} width={sw} height={sh} />
          <image href={`${UI}pirates_arena_battle_end_logo.png`} x={(-686 * 0.97 * 1.3) / 2} y={-27 * 1.3 - (176 * 0.97 * 1.3) / 2} width={686 * 0.97 * 1.3} height={176 * 0.97 * 1.3} />
        </g>
      )}
      {logoP > 0 && (
        <g transform={`translate(${W / 2},${logoY}) scale(${logoScale})`} opacity={logoP}>
          <image href={`${UI}${logo.href}`} x={-lw / 2} y={-lh / 2} width={lw} height={lh} />
        </g>
      )}
      {cardP > 0 && <ResultCard units={props.units} info={props.info} sub={sub} x={W / 2} y={H - 40 - (1 - cardP) * 60} opacity={cardP} />}
    </g>
  );
}

/** Two rows, your team over the opponent: portraits (KO'd in greyscale), units left and damage dealt. */
function ResultCard(props: { units: EndUnit[]; info: Map<string, UnitInfo>; sub: string; x: number; y: number; opacity: number }) {
  const cw = 640, rowH = 92, ch = 2 * rowH + 56;
  const sz = 64;
  const row = (side: "atk" | "def", y: number) => {
    const list = props.units.filter((u) => u.side === side);
    const left = list.filter((u) => u.alive).length;
    const dmg = list.reduce((s, u) => s + u.damageDealt, 0);
    return (
      <g transform={`translate(0,${y})`}>
        <text x={18} y={22} className={`battle-end-team battle-end-team-${side}`}>{side === "atk" ? "YOUR TEAM" : "OPPONENT"}</text>
        <text x={cw - 18} y={22} className="battle-end-stat" textAnchor="end">{`${left} left · ${Math.round(dmg).toLocaleString("en-US")} damage`}</text>
        {list.map((u, n) => {
          const i = props.info.get(u.uid);
          if (!i) return null;
          const x = 18 + n * (sz + 8);
          return (
            <g key={u.uid} className={u.alive ? undefined : "bench-ko"}>
              <SvgThumb id={i.unitId} size={sz} x={x} y={30} />
              <rect x={x} y={30} width={sz} height={sz} rx={6} className={`thumb-frame thumb-frame-${side}`} />
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <g transform={`translate(${props.x - cw / 2},${props.y - ch})`} opacity={props.opacity}>
      <rect width={cw} height={ch} className="battle-end-card" />
      {row("atk", 10)}
      {row("def", 10 + rowH)}
      <text x={cw / 2} y={ch - 16} className="battle-end-sub small">{props.sub}</text>
    </g>
  );
}
