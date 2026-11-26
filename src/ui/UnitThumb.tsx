import { useState } from "react";
import { portraitOf } from "../engine/boss";

const IMAGE_HOST = "https://2shankz.github.io/optc-db.github.io/api/images/thumbnail/";

/**
 * OPTC-DB square thumbnail URLs, mirroring utils.getThumbnailUrl on the OPTC-DB site.
 * VS / dual forms (ids like 4529.1) use "4529-1.png". Global art first, Japanese as fallback.
 */
export function thumbUrls(unitId: number): string[] {
  const id = portraitOf(unitId); // an Assault Rumble boss shows its base unit
  const base = Math.floor(id);
  const form = Number.isInteger(id) ? undefined : String(id).split(".")[1];
  const folder = `${Math.trunc(base / 1000)}/${Math.trunc((base % 1000) / 100)}00`;
  const file = form ? `${base}-${form}` : String(base).padStart(4, "0");
  return ["glo", "jap"].map((r) => `${IMAGE_HOST}${r}/${folder}/${file}.png`);
}

/** Square unit portrait with automatic fallback (global → Japanese → color placeholder). */
export function UnitThumb(props: { id: number; size: number; colorClass?: string; title?: string; badge?: string | null }) {
  // an Assault Rumble boss shows its own type badge (the game's, public/game-ui/type/) over its base unit's
  if (props.badge) {
    const t = props.badge.replace(/[[\]]/g, "");
    return (
      <span className="thumb-wrap" style={{ width: props.size, height: props.size }} title={props.title}>
        <UnitThumb {...props} badge={undefined} />
        <img className="type-badge" src={`game-ui/type/${t}.png`} alt={t} />
      </span>
    );
  }
  return <PlainThumb {...props} />;
}

function PlainThumb(props: { id: number; size: number; colorClass?: string; title?: string }) {
  const urls = thumbUrls(props.id);
  const [i, setI] = useState(0);
  const style = { width: props.size, height: props.size };
  if (i >= urls.length) return <span className={`thumb thumb-missing ${props.colorClass ?? ""}`} style={style} title={props.title} />;
  return (
    <img
      className="thumb"
      src={urls[i]}
      width={props.size}
      height={props.size}
      style={style}
      alt=""
      title={props.title}
      loading="lazy"
      onError={() => setI(i + 1)}
    />
  );
}

/** SVG version for the battle field. */
export function SvgThumb(props: { id: number; size: number; x: number; y: number }) {
  const urls = thumbUrls(props.id);
  const [i, setI] = useState(0);
  if (i >= urls.length) return null;
  return (
    <image
      href={urls[i]}
      x={props.x}
      y={props.y}
      width={props.size}
      height={props.size}
      onError={() => setI(i + 1)}
      preserveAspectRatio="xMidYMid slice"
    />
  );
}
