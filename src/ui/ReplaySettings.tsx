import { useEffect, useRef, useState } from "react";

/** A checkbox, or a slider (`range`), in the View dropdown. `disabled` greys it out (e.g. it has nothing to act on). */
export type ViewOption =
  | { kind?: "check"; label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; /** a color key: swatch + tick color */ color?: string }
  | {
      kind: "range"; label: string; help: string; value: number; min: number; max: number; step: number;
      format: (v: number) => string; onChange: (v: number) => void; disabled?: boolean;
    };

/** The replay's "View" dropdown: display options in groups, closed when you click elsewhere or press Escape. */
export function ReplaySettings(props: { groups: { title: string; options: ViewOption[] }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="view-menu" ref={box}>
      <button className={`view-btn ${open ? "on" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} title="What the replay shows">
        ⚙ View ▾
      </button>
      {open && (
        <div className="view-panel" role="menu">
          {props.groups.map((g) => (
            <fieldset key={g.title}>
              <legend>{g.title}</legend>
              {g.options.map((o) =>
                o.kind === "range" ? (
                  <label key={o.label} title={o.help} className={`view-range ${o.disabled ? "disabled" : ""}`}>
                    <span>{o.label}</span>
                    <input type="range" min={o.min} max={o.max} step={o.step} value={o.value} disabled={o.disabled}
                      onChange={(e) => o.onChange(Number(e.target.value))} aria-label={o.label} />
                    <span className="view-range-value">{o.format(o.value)}</span>
                  </label>
                ) : (
                  <label key={o.label} title={o.help} className={o.disabled ? "disabled" : undefined}>
                    <input type="checkbox" checked={o.checked} disabled={o.disabled} onChange={(e) => o.onChange(e.target.checked)}
                      style={o.color ? { accentColor: o.color } : undefined} />
                    <span>{o.label}</span>
                    {o.color && <span className="view-swatch" style={{ background: o.color }} aria-hidden="true" />}
                  </label>
                ),
              )}
            </fieldset>
          ))}
          <p className="view-keys">Space play / pause · ← → 1 s (Shift 0.25 s) · drag to move · scroll to zoom</p>
        </div>
      )}
    </div>
  );
}
