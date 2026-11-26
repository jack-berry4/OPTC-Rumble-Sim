import { useEffect, useRef } from "react";
import type { Rect } from "./fieldCamera";

/**
 * A small map of the whole field (the map's edges) with every unit as a dot (red: your team, blue: the enemy) and the
 * camera's view outlined. Click or drag on it to move the camera there. Shown while you steer the camera; it fades
 * out shortly after you stop.
 */
export function Minimap(props: {
  /** false: faded out (and not clickable). */
  visible: boolean;
  onHover: (on: boolean) => void;
  bounds: Rect;
  cam: Rect;
  units: { uid: string; x: number; y: number; side: "atk" | "def" }[];
  onMove: (x: number, y: number) => void;
  /** Wheel over the minimap: zoom the camera by this factor. */
  onZoom: (factor: number) => void;
}) {
  const { bounds: b, cam } = props;
  const svg = useRef<SVGSVGElement>(null);
  const zoom = useRef(props.onZoom);
  zoom.current = props.onZoom;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // zoom the camera, don't scroll the page
      zoom.current(Math.exp((e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const down = useRef(false);
  const toGame = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    props.onMove(b.x + ((e.clientX - r.left) / r.width) * b.w, b.y + ((e.clientY - r.top) / r.height) * b.h);
  };
  return (
    <svg
      ref={svg}
      className={`minimap ${props.visible ? "" : "faded"}`}
      onPointerEnter={() => props.onHover(true)}
      onPointerLeave={() => props.onHover(false)}
      viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
      role="img"
      aria-label="Minimap: click or drag to move the camera, scroll to zoom"
      onPointerDown={(e) => { e.stopPropagation(); down.current = true; e.currentTarget.setPointerCapture(e.pointerId); toGame(e); }}
      onPointerMove={(e) => { e.stopPropagation(); if (down.current) toGame(e); }}
      onPointerUp={(e) => { e.stopPropagation(); down.current = false; }}
      onPointerCancel={() => { down.current = false; }}
    >
      <title>Minimap: click or drag to move the camera, scroll to zoom</title>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} className="minimap-bg" />
      {props.units.map((u) => <circle key={u.uid} cx={u.x} cy={u.y} r={26} className={`minimap-dot minimap-${u.side}`} />)}
      <rect x={cam.x} y={cam.y} width={cam.w} height={cam.h} className="minimap-cam" />
    </svg>
  );
}
