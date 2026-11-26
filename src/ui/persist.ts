import { useEffect, useState } from "react";

/** Settings remembered in this browser (localStorage); every read and write survives storage being unavailable. */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function usePersisted<T>(key: string, parse: (s: string | null) => T, show: (v: T) => string): [T, (v: T) => void] {
  const [v, setV] = useState(() => parse(read(key)));
  useEffect(() => {
    try {
      localStorage.setItem(key, show(v));
    } catch {
      /* storage unavailable */
    }
  }, [key, v]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV];
}

/** A checkbox setting. */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  return usePersisted(key, (s) => (s === null ? fallback : s === "1"), (v) => (v ? "1" : "0"));
}

/** A number setting, kept within [min, max] (0-1 by default). */
export function usePersistedNumber(key: string, fallback: number, min = 0, max = 1): [number, (v: number) => void] {
  return usePersisted(
    key,
    (s) => {
      const n = Number(s);
      return s !== null && s !== "" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    },
    String,
  );
}

/** One of a fixed set of choices. */
export function usePersistedChoice<T extends string>(key: string, choices: readonly T[], fallback: T): [T, (v: T) => void] {
  return usePersisted(key, (s) => (choices.includes(s as T) ? (s as T) : fallback), (v) => v);
}
