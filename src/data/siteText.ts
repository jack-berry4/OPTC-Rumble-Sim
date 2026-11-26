import { useEffect, useState } from "react";

/**
 * The OPTC-DB website's own Rumble text (scripts/import-rumble-text.ts), loaded on first use: 6.8 MB, so it is a
 * separate chunk and doesn't slow the app's start. Arrays are per level (index = level - 1); `l*` = the LLB versions.
 */
export interface UnitText {
  a?: string[][]; la?: string[][];
  s?: string[][]; ls?: string[][];
  r?: string[]; lr?: string[];
  ss?: { condition: string; lines: string[] }; lss?: { condition: string; lines: string[] };
  p?: string[]; t?: string;
}

let cache: Record<string, UnitText> | undefined;
let loading: Promise<Record<string, UnitText>> | undefined;
const load = () =>
  (loading ??= import("./generated/rumble-text.json").then((m) => {
    cache = (m.default as unknown as { units: Record<string, UnitText> }).units;
    return cache;
  }));

/** The site's text for a unit, once loaded (undefined while loading or for units the site doesn't have). */
export function useSiteText(unitId: number, enabled = true): UnitText | undefined {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (enabled && !cache) void load().then(() => rerender((n) => n + 1));
  }, [enabled]);
  return cache?.[String(unitId)];
}
