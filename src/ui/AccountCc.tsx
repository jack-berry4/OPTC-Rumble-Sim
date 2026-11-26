import { useEffect, useState } from "react";
import { accountMaxCc, CC_MONUMENT, ccMonumentLevel, snapAccountCc, type Cc } from "../engine/stats";

const STATS = ["hp", "atk", "rcv"] as const;

/**
 * An account's cotton candy maximum, per stat: type the amount (it snaps up to the next value the game allows when
 * you leave the box) or pick the stat's monument level (0-35).
 */
export function AccountCc(props: { value?: Cc; onChange: (cc: Cc) => void }) {
  const cc = accountMaxCc(props.value);
  return (
    <div className="cc-row account-cc">
      {STATS.map((k) => (
        <StatCc key={k} stat={k} value={cc[k]} onChange={(v) => props.onChange({ ...cc, [k]: v })} />
      ))}
    </div>
  );
}

function StatCc(props: { stat: (typeof STATS)[number]; value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  const commit = () => {
    const v = snapAccountCc(Number(draft) || 0);
    setDraft(String(v));
    if (v !== props.value) props.onChange(v);
  };
  return (
    <label title={`${props.stat.toUpperCase()} cotton candy max: ${CC_MONUMENT[0]}-${CC_MONUMENT[CC_MONUMENT.length - 1]}, one step per monument level (other amounts round up)`}>
      {props.stat.toUpperCase()}
      <input
        type="number"
        className="num-input"
        min={CC_MONUMENT[0]}
        max={CC_MONUMENT[CC_MONUMENT.length - 1]}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <select className="monument" value={ccMonumentLevel(props.value)} title="Monument level" onChange={(e) => props.onChange(CC_MONUMENT[Number(e.target.value)]!)}>
        {CC_MONUMENT.map((v, lv) => <option key={lv} value={lv}>Lv {lv} ({v})</option>)}
      </select>
    </label>
  );
}
