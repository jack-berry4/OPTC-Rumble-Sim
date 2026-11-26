import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** A camera rectangle in game pixels (an SVG viewBox). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pan (drag), zoom (wheel, about the cursor) and an automatic camera for the replay field.
 *
 * The camera keeps the aspect ratio of `home`, never shows past `bounds` and never zooms closer than `minW` game px
 * across. In auto mode it glides toward `target` (e.g. a box around every unit); any drag or wheel turns auto off.
 */
export function useFieldCamera(opts: {
  svgRef: RefObject<SVGSVGElement | null>;
  home: Rect;
  bounds: Rect;
  minW: number;
  target: Rect | null;
  auto: boolean;
  setAuto: (on: boolean) => void;
}) {
  const { svgRef, home, bounds, minW, target, auto, setAuto } = opts;
  const aspect = home.w / home.h;
  const maxW = Math.min(bounds.w, bounds.h * aspect);

  const clamp = (r: Rect): Rect => {
    const w = Math.max(minW, Math.min(maxW, r.w));
    const h = w / aspect;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - w, cx - w / 2));
    const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - h, cy - h / 2));
    return { x, y, w, h };
  };

  const [cam, setCam] = useState<Rect>(() => clamp(home));
  const camRef = useRef(cam);
  camRef.current = cam;

  // Auto camera: glide toward the target (about 0.3 s to settle), stop once there.
  const targetRef = useRef<Rect | null>(null);
  targetRef.current = target ? clamp(fitAspect(target, aspect)) : null;
  useEffect(() => {
    if (!auto) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const tg = targetRef.current;
      if (tg) {
        const c = camRef.current;
        const k = 1 - Math.exp(-dt / 0.12);
        const d = Math.abs(tg.x - c.x) + Math.abs(tg.y - c.y) + Math.abs(tg.w - c.w);
        if (d > 0.3) setCam({ x: c.x + (tg.x - c.x) * k, y: c.y + (tg.y - c.y) * k, w: c.w + (tg.w - c.w) * k, h: c.h + (tg.h - c.h) * k });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  /** Game px per screen px. */
  const scale = () => {
    const el = svgRef.current;
    return el ? camRef.current.w / Math.max(1, el.getBoundingClientRect().width) : 1;
  };

  // Wheel zoom (a native listener: React's wheel handler can't prevent the page from scrolling).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setAuto(false);
      const box = el.getBoundingClientRect();
      const c = camRef.current;
      const fx = (e.clientX - box.left) / box.width, fy = (e.clientY - box.top) / box.height;
      const px = c.x + fx * c.w, py = c.y + fy * c.h; // game point under the cursor stays put
      const f = Math.exp((e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY) * 0.0015);
      const w = Math.max(minW, Math.min(maxW, c.w * f)), h = w / aspect;
      setCam(clamp({ x: px - fx * w, y: py - fy * h, w, h }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Drag to pan.
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    setAuto(false);
    d.x = e.clientX;
    d.y = e.clientY;
    const s = scale();
    const c = camRef.current;
    setCam(clamp({ ...c, x: c.x - dx * s, y: c.y - dy * s }));
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  /** Zoom by a factor about the view's centre (e.g. the wheel over the minimap); turns auto off. */
  const zoomBy = (f: number) => {
    setAuto(false);
    const c = camRef.current;
    const w = Math.max(minW, Math.min(maxW, c.w * f)), h = w / aspect;
    setCam(clamp({ x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2, w, h }));
  };

  /** Centre the camera on a game point (e.g. from the minimap); turns auto off. */
  const moveTo = (x: number, y: number) => {
    setAuto(false);
    const c = camRef.current;
    setCam(clamp({ ...c, x: x - c.w / 2, y: y - c.h / 2 }));
  };

  return { cam, moveTo, zoomBy, dragging: drag.current !== null, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

/** Grow a box to the camera's aspect ratio, keeping its centre. */
function fitAspect(r: Rect, aspect: number): Rect {
  let { w, h } = r;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}
