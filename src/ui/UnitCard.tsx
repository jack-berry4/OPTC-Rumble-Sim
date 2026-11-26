import { useEffect, useState } from "react";
import type { UnitDb } from "../data/unitDb";
import { effectLines, superConditionToString } from "../data/rumbleText";
import { useSiteText } from "../data/siteText";
import { kitFor, llbPartsActive } from "../engine/stats";
import type { UnitSummary } from "../engine/types";
import { UnitThumb } from "./UnitThumb";
import { Typed } from "./Typed";

/**
 * Under the team lineups: the clicked unit's Rumble special and ability (at its levels and LLB in this battle). Slides
 * open and shut; it keeps showing the last unit while it closes.
 */
export function UnitCard(props: { db: UnitDb; units: UnitSummary[]; info: Map<string, { tag: string }>; uid?: string; onClose: () => void }) {
  const [last, setLast] = useState(props.uid);
  useEffect(() => { if (props.uid) setLast(props.uid); }, [props.uid]);
  const open = !!props.uid;
  const u = props.units.find((x) => x.uid === last);
  return (
    <div className={`unit-card-wrap ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="unit-card-inner">{u && <CardBody db={props.db} unit={u} tag={props.info.get(u.uid)?.tag ?? u.uid} onClose={props.onClose} />}</div>
    </div>
  );
}

function CardBody(props: { db: UnitDb; unit: UnitSummary; tag: string; onClose: () => void }) {
  const rec = props.db.byId.get(props.unit.unitId);
  const site = useSiteText(props.unit.unitId);
  if (!rec) return null;
  const m = props.unit.member ?? { unitId: rec.id };
  const kit = kitFor(rec, m);
  const llb = llbPartsActive(rec, m);
  const spLv = Math.min(Math.max(1, m.specialLevel ?? 10), kit.specials.length);
  const abLv = Math.min(Math.max(1, m.abilityLevel ?? 5), kit.abilities.length);
  const pick = <T,>(base: T | undefined, l: T | undefined, isLlb: boolean) => (isLlb && l !== undefined ? l : base);
  const special = pick(site?.s, site?.ls, llb.includes("special"))?.[spLv - 1] ?? effectLines(kit.specials[spLv - 1]?.effects ?? []);
  const ability = pick(site?.a, site?.la, llb.includes("ability"))?.[abLv - 1] ?? effectLines(kit.abilities[abLv - 1] ?? []);
  const sup = pick(site?.ss, site?.lss, llb.includes("super special"));
  return (
    <div className={`unit-card side-${props.unit.side}`}>
      <div className="unit-card-head">
        <UnitThumb id={rec.id} size={40} />
        <div className="unit-card-title">
          <b>{props.tag}</b> {rec.name}
        </div>
        <button className="icon" title="Close" onClick={props.onClose}>✕</button>
      </div>
      <div className="unit-card-cols">
        {kit.specials.length > 0 && (
          <section>
            <h5>Special <span className="muted">lv {spLv}{llb.includes("special") ? " · LLB" : ""} · CT {kit.specials[spLv - 1]?.cooldown ?? "?"}s</span></h5>
            <ul className="kit-lines">{special.map((t, i) => <li key={i}><Typed text={t} /></li>)}</ul>
            {kit.superSpecial && (
              <>
                <h5>Super special <span className="muted">{sup?.condition || superConditionToString(kit.superSpecial.condition)}</span></h5>
                <ul className="kit-lines">{(sup?.lines ?? effectLines(kit.superSpecial.effects)).map((t, i) => <li key={i}><Typed text={t} /></li>)}</ul>
              </>
            )}
          </section>
        )}
        {kit.abilities.length > 0 && (
          <section>
            <h5>Ability <span className="muted">lv {abLv}{llb.includes("ability") ? " · LLB" : ""}</span></h5>
            <ul className="kit-lines">{ability.map((t, i) => <li key={i}><Typed text={t} /></li>)}</ul>
          </section>
        )}
        {!kit.specials.length && !kit.abilities.length && <p className="muted small">No Rumble special or ability.</p>}
      </div>
    </div>
  );
}
