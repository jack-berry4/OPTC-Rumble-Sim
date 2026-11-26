/**
 * Type names in their game colors wherever the app writes them (user, 2026-11-22): STR red, DEX green, QCK blue,
 * PSY yellow, INT purple; shades picked to stay readable on the light and the dark theme (styles.css `.ty-*`).
 */
import type { ReactNode } from "react";

const TYPES = /\b(STR|DEX|QCK|PSY|INT)\b/g;

/** Text with every STR / DEX / QCK / PSY / INT colored ("[QCK]" and "QCK-type" included). */
export function Typed({ text }: { text: string | undefined | null }): ReactNode {
  if (!text) return text ?? null;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TYPES)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(<span key={i} className={`ty ty-${m[1]}`}>{m[1]}</span>);
    last = i + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
