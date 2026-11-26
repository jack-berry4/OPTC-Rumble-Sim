/**
 * Damage and heal numbers over the units, as the game pops them: a bold italic number above the head that jumps in,
 * rises and fades. Damage in red, damage into a Shield in the shield's blue, heals in green; nothing else (no crit / guard labels).
 */
export interface FloatNum {
  key: string;
  uid: string;
  amount: number;
  heal: boolean;
  /** Damage that went into a Shield: drawn in the shield's blue. */
  shield?: boolean;
  /** 0 when it appears, 1 when it is gone. */
  age: number;
  /** Stacking slot when several numbers show on one unit at once. */
  slot: number;
}

/** Seconds a number stays up. */
export const NUM_DUR = 0.9;

export function DamageNumbers(props: { list: FloatNum[]; pos: Map<string, { x: number; y: number }> }) {
  return (
    <g className="dmg-nums" pointerEvents="none">
      {props.list.map((n) => {
        const p = props.pos.get(n.uid);
        if (!p) return null;
        const a = n.age;
        const scale = a < 0.12 ? 0.6 + (a / 0.12) * 0.7 : a < 0.22 ? 1.3 - ((a - 0.12) / 0.1) * 0.3 : 1; // jump in, settle
        const rise = 12 * a; // a slow, short drift up over its whole time
        const opacity = a < 0.7 ? 1 : Math.max(0, 1 - (a - 0.7) / 0.3);
        return (
          <g key={n.key} transform={`translate(${p.x + (n.slot % 2 ? 18 : -10) * Math.min(1, n.slot)},${p.y - 24 - rise - n.slot * 26}) scale(${scale})`} opacity={opacity}>
            <text className={`dmg-num ${n.heal ? "dmg-heal" : n.shield ? "dmg-shield" : ""}`}>{n.heal ? "+" : ""}{Math.round(n.amount).toLocaleString("en-US")}</text>
          </g>
        );
      })}
    </g>
  );
}
