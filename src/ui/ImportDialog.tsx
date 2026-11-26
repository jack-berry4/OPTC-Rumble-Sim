/**
 * Import from screenshots and box videos (docs/IMPORT_PLAN.md). Drop / paste / pick any of the game's team screens
 * (Confirm Opponent / Assault VS, team edit, GP teams when FEATURES.grandParty), unit pages (Character Details, general or Rumble status) or a
 * video of the box scrolling by. Each unit is matched by its portrait (a Rumble status page by its name), its numbers
 * are read, and its build is worked out from them; what no screen shows comes from the defaults chosen here.
 *
 * Before anything is used, every unit can be checked in the unit review (click it): the unit (or another one), each
 * stat and where it came from (read / worked out / default / set by you), the whole build to change, and save it to the
 * box or Recent units. A box video's hundreds of units come as a table, least sure first. Nothing is uploaded.
 */
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { UnitDb } from "../data/unitDb";
import { inferBuild, type Fact, type Inferred, type Seen } from "../import/infer";
import { stopOcr } from "../import/ocr";
import { loadPortraits } from "../import/portraits";
import { readCanvas, readImages, readVideo, SCREEN_NAMES, type ReadShot, type ReadTile } from "../import/read";
import { GP_KINDS, SURE, theirs, type ScreenKind } from "../import/screens";
import { FEATURES } from "../features";
import type { PresetDef } from "../engine/stats";
import { changedGroups, FACT_GROUPS, GROUP_NAMES, STAT_GROUPS, withKnown, type StatGroup } from "../engine/buildGroups";
import { encodeTeam } from "../engine/teamCode";
import { isVsCombined, unitLabel, vsHalves } from "../data/vs";
import type { MemberConfig, TeamConfig } from "../engine/types";
import { colorClass, DefaultBuild, UnitSearch, UnitSettings } from "./TeamEditor";
import { UnitThumb } from "./UnitThumb";

const DEFAULTS_KEY = "rumble-sim-import-defaults-v1";
type Defaults = { mine: string; theirs: string };

/** The chosen unit of each place (null = empty), by shot and tile. */
type Picks = Record<string, (number | null)[]>;
const pickOf = (t: ReadTile): number | null => (t.empty ? null : t.match.id);
/** Whose unit a place shows: yours, the opponent's, or either (a Rumble status page). */
type Owner = "mine" | "theirs" | "either";
const ownerOf = (s: ReadShot, t: ReadTile): Owner => (s.kind === "rumbleDetails" ? "either" : theirs(s.kind, t.group) ? "theirs" : "mine");
const placeKey = (shot: string, k: number) => `${shot}#${k}`;

/**
 * Everything seen of one unit across the screenshots (a team edit in both displays gives the whole build). Where
 * screenshots disagree (a misread "+514" on one of three), most of them win; a tie goes to the first (this one).
 */
function mergeSeen(list: Seen[]): Seen {
  const out: Seen = {};
  const votes = new Map<string, Map<string, { v: unknown; n: number }>>();
  for (const s of list) {
    for (const [k, v] of Object.entries(s) as [keyof Seen, Seen[keyof Seen]][]) {
      if (v == null) continue;
      if (k === "rumble" || k === "main" || k === "alts") (out as Record<string, unknown>)[k] = { ...Object.fromEntries(Object.entries(v as object).filter(([, x]) => x != null)), ...((out[k] as object | undefined) ?? {}) };
      else {
        const m = votes.get(k) ?? new Map<string, { v: unknown; n: number }>();
        const j = JSON.stringify(v);
        m.set(j, { v, n: (m.get(j)?.n ?? 0) + 1 });
        votes.set(k, m);
      }
    }
  }
  for (const [k, m] of votes) {
    let best: { v: unknown; n: number } | undefined;
    for (const x of m.values()) if (!best || x.n > best.n) best = x;
    (out as Record<string, unknown>)[k] = best!.v;
  }
  return out;
}

/** A part of a build as text (the review's "set by you" rows). */
function groupText(m: MemberConfig, g: StatGroup): string {
  switch (g) {
    case "level": return String(m.level ?? "?");
    case "llb": return String(m.llbLevel ?? 0);
    case "lb": return `${m.lbNodes ?? "?"} nodes${m.lbKey ? " (with the LB key)" : ""}`;
    case "rumbleKey": return m.rumbleKey ? "yes" : "no";
    case "cc": return m.ccMode === "custom" && m.cc ? `${m.cc.hp} HP / ${m.cc.atk} ATK / ${m.cc.rcv} RCV` : m.ccMode === "none" ? "none" : "account max";
    case "potentials": return (m.potentialLevels ?? []).join(" / ") || "?";
    case "sockets": return String(m.sockets ?? "?");
    case "special": return String(m.specialLevel ?? "max");
    case "ability": return String(m.abilityLevel ?? "max");
    case "mainSpecial": return String(m.mainSpecialLevel ?? "max");
  }
}

/** One unit place as it stands: its pick, the build worked out, and any change made in the review. */
interface Entry {
  shot: ReadShot & { key: string };
  k: number;
  tile: ReadTile;
  id: number | null;
  owner: Owner;
  build?: Inferred;
  /** The build used: the review's (changed by hand) or the one worked out. */
  member?: MemberConfig;
  /** Parts changed by hand in the review. */
  changed: StatGroup[];
  /** Looked over and confirmed in the review. */
  checked: boolean;
  /** How sure the reading is (0-1, lower = worth a look) and why. */
  sure: number;
  why: string[];
}

export function ImportDialog(props: {
  db: UnitDb;
  presets: PresetDef[];
  maxCc?: TeamConfig["maxCc"];
  onTeam: (side: "atk" | "def", t: TeamConfig, title: string) => void;
  onSave: (teams: { title: string; team: TeamConfig }[]) => void;
  onBox: (units: MemberConfig[]) => void;
  onRecent: (units: MemberConfig[]) => void;
  /** Use this build for the same unit wherever it is on your teams. */
  onUpdate: (m: MemberConfig) => number;
  onClose: () => void;
  /** Shown in a page (My Boxes) rather than as a dialog: its title, and the box it fills. */
  inline?: { title: string; boxName: string };
  /** My Boxes: the box becomes exactly the units read. */
  onReplaceBox?: (units: MemberConfig[]) => void;
  /** Kept running out of sight (My Boxes while you're on another page): pasting doesn't add here. */
  hidden?: boolean;
  /** What it's reading (undefined when idle), and a way to stop it: for the bar shown on other pages. */
  onBusy?: (b: { text: string; stop: () => void } | undefined) => void;
}) {
  const { db } = props;
  const [shots, setShots] = useState<(ReadShot & { key: string })[]>([]);
  const counter = useRef(0);
  const [picks, setPicks] = useState<Picks>({});
  /** Builds changed in the review, by place. */
  const [edits, setEdits] = useState<Record<string, MemberConfig>>({});
  /** Places looked over and confirmed in the review. */
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [review, setReview] = useState<{ list: [string, number][]; i: number }>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [help, setHelp] = useState(false);
  const defaultBuild = useContext(DefaultBuild);
  const [defaults, setDefaults] = useState<Defaults>(() => {
    const fallback = defaultBuild?.label ?? props.presets.find((p) => p.label === "Lv 99")?.label ?? props.presets[0]?.label ?? "";
    try { const d = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? "null") as Defaults | null; if (d) return d; } catch { /* none saved */ }
    return { mine: fallback, theirs: fallback };
  });
  useEffect(() => { try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults)); } catch { /* private mode */ } }, [defaults]);
  const presetFor = (o: Owner) => props.presets.find((p) => p.label === (o === "theirs" ? defaults.theirs : defaults.mine)) ?? defaultBuild;
  const stop = useRef({ stopped: false });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadPortraits().catch((e) => setError(`Couldn't load the portrait data: ${String(e)}`)); }, []);
  useEffect(() => () => { void stopOcr(); }, []);
  // while reading: tell the page (its bar elsewhere), and warn before a reload or closing the tab ends it
  useEffect(() => { props.onBusy?.(busy ? { text: busy, stop: () => { stop.current.stopped = true; } } : undefined); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const close = () => { if (!busy || confirm("It's still reading: closing stops it. Close anyway?")) props.onClose(); };

  const add = (list: ReadShot[]) => {
    const keyed = list.map((x) => ({ ...x, key: `${x.name}#${counter.current++}` }));
    setShots((s) => [...s, ...keyed]);
    setPicks((p) => ({ ...p, ...Object.fromEntries(keyed.map((x) => [x.key, x.tiles.map(pickOf)])) }));
  };

  const takeFiles = async (files: File[]) => {
    setError(undefined); setDone(undefined);
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const vids = files.filter((f) => f.type.startsWith("video/"));
    if (!imgs.length && !vids.length) return setError("Those aren't images or videos.");
    try {
      if (imgs.length) {
        setBusy(`Reading ${imgs.length} screenshot${imgs.length === 1 ? "" : "s"}… (the first one loads the text reader)`);
        add(await readImages(imgs, db, (d, t) => setBusy(`Reading screenshots… ${d}/${t}`)));
      }
      for (const v of vids) {
        stop.current = { stopped: false };
        setBusy(`Reading ${v.name}…`);
        add([await readVideo(v, { signal: stop.current, onProgress: setBusy })]);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(undefined);
    }
  };

  // paste images (Ctrl+V) anywhere while the import is shown
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (props.hidden) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); void takeFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const setPick = (key: string, k: number, id: number | null) => {
    setPicks((p) => ({ ...p, [key]: (p[key] ?? []).map((x, j) => (j === k ? id : x)) }));
    // another unit: the hand-made build was for the old one
    setEdits((e) => { const n = { ...e }; delete n[placeKey(key, k)]; return n; });
  };
  const reread = async (i: number, kind: ScreenKind) => {
    const s = shots[i];
    if (!s?.canvas) return;
    setBusy(`Reading ${s.name} as ${SCREEN_NAMES[kind]}…`);
    try {
      const idx = await loadPortraits();
      const r = { ...(await readCanvas(idx, db, s.canvas, s.name, kind)), key: s.key };
      setShots((list) => list.map((x) => (x.key === s.key ? r : x)));
      setPicks((p) => ({ ...p, [s.key]: r.tiles.map(pickOf) }));
    } finally {
      setBusy(undefined);
    }
  };

  /** The unit a pick stands for (a VS portrait: its first half; the other half can be picked from the list). */
  const unitOf = (id: number) => vsHalves(db, id)[0] ?? id;
  // load every picked unit's detail (the build needs its kit and Limit Break)
  const pickedIds = useMemo(() => [...new Set(Object.values(picks).flat().filter((x): x is number => x != null).flatMap((id) => vsHalves(db, id)))], [picks, db]);
  const [ready, setReady] = useState(0);
  /** While units' details load: how many of the missing ones are in. */
  const [loadingUnits, setLoadingUnits] = useState<{ done: number; total: number }>();
  useEffect(() => {
    let live = true;
    // redraw once loaded, even when a unit's detail can't be loaded (the others still are)
    const missing = pickedIds.filter((id) => !db.hasDetail(id));
    if (missing.length) setLoadingUnits({ done: 0, total: missing.length });
    void db.ensure(missing, (done, total) => { if (live) setLoadingUnits({ done, total }); })
      .catch((e) => console.warn("import: unit detail", e))
      .finally(() => { if (live) { setReady((n) => n + 1); setLoadingUnits(undefined); } });
    return () => { live = false; };
  }, [pickedIds, db]);

  /** Every reading of a unit by owner, across all screenshots. */
  const seenBy = useMemo(() => {
    const m = new Map<string, Seen[]>();
    for (const s of shots) {
      const pk = picks[s.key] ?? [];
      s.tiles.forEach((t, k) => {
        const id = pk[k];
        if (id == null || !t.seen) return;
        const o = ownerOf(s, t);
        for (const who of o === "either" ? ["mine", "theirs"] : [o]) {
          const key = `${who}:${unitOf(id)}`;
          m.set(key, [...(m.get(key) ?? []), t.seen]);
        }
      });
    }
    return m;
  }, [shots, picks]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A unit's build from everything seen of it (none while its detail loads). Cached: a fit can take a while. */
  const builds = useRef(new Map<string, Inferred>());
  const buildOf = (id: number, owner: Owner, own?: Seen): Inferred | undefined => {
    const uid = unitOf(id);
    const rec = db.byId.get(uid);
    const who = owner === "theirs" ? "theirs" : "mine";
    const seen = mergeSeen([...(own ? [own] : []), ...(seenBy.get(`${who}:${uid}`) ?? [])]);
    if (!rec || !db.hasDetail(uid)) return undefined;
    const preset = presetFor(owner);
    const key = `${uid}|${preset?.label}|${JSON.stringify(seen)}`;
    let b = builds.current.get(key);
    if (!b) { b = inferBuild(rec, seen, preset, uid); builds.current.set(key, b); }
    return b;
  };
  void ready;

  const entry = (s: ReadShot & { key: string }, k: number): Entry => {
    const tile = s.tiles[k]!;
    const id = (picks[s.key] ?? [])[k] ?? null;
    const owner = ownerOf(s, tile);
    const pk = placeKey(s.key, k);
    const build = id != null ? buildOf(id, owner, tile.seen) : undefined;
    const edit = edits[pk];
    const member = edit ?? build?.member;
    const changed = edit && build ? changedGroups(build.member, edit) : [];
    const why: string[] = [];
    let sure = 1;
    if (id != null && id === tile.match.id && tile.match.score < SURE) { why.push(`unsure match (${Math.round(tile.match.score * 100)}%)`); sure -= 1 - tile.match.score; }
    if (build?.misfit) { why.push("stats fit no build"); sure -= 0.5; }
    if (build && build.facts.find((f) => f.what === "Level")?.how === "unknown") { why.push("level not read"); sure -= 0.2; }
    if (checked[pk]) { sure = 1; why.length = 0; }
    return { shot: s, k, tile, id, owner, build, member, changed, checked: !!checked[pk], sure, why };
  };
  const memberOf = (e: Entry): MemberConfig | undefined => (e.id == null ? undefined : e.member ?? { unitId: unitOf(e.id) });

  const teamOf = (s: ReadShot & { key: string }, group: string): TeamConfig => {
    const members: (MemberConfig | null)[] = Array.from({ length: 8 }, () => null);
    s.tiles.forEach((t, k) => { if (t.group === group && t.index < 8) members[t.index] = memberOf(entry(s, k)) ?? null; });
    const team: TeamConfig = { members, ...(props.maxCc ? { maxCc: props.maxCc } : {}) };
    // Grand Party: the leader (marked on whichever team it is) leads every team of the screenshot
    const li = s.tiles.findIndex((t) => t.leader);
    const lm = li >= 0 ? memberOf(entry(s, li)) : undefined;
    if ((s.kind === "gpTeam" || s.kind === "gpOpponent") && lm) team.leader = { member: lm };
    return team;
  };
  /** Units of a shot, a VS unit as both halves (the box holds both, one shared build). */
  const allOf = (s: ReadShot & { key: string }, filter: (t: ReadTile) => boolean = () => true): MemberConfig[] =>
    s.tiles.flatMap((t, k) => {
      const e = entry(s, k);
      const m = memberOf(e);
      if (!m || e.id == null || !filter(t)) return [];
      return vsHalves(db, e.id).map((u) => ({ ...m, unitId: u }));
    });
  const unitsOf = (e: Entry): MemberConfig[] => { const m = memberOf(e); return m && e.id != null ? vsHalves(db, e.id).map((u) => ({ ...m, unitId: u })) : []; };

  const boxName = props.inline?.boxName ?? "My box";
  const open = (list: [string, number][], i: number) => setReview({ list, i });
  const cur = review ? (() => { const [sk, k] = review.list[review.i]!; const s = shots.find((x) => x.key === sk); return s ? entry(s, k) : undefined; })() : undefined;

  const body = (
    <>
        {props.inline
          ? <BoxVideoHelp />
          : (help || !shots.length) && <ImportHelp />}
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void takeFiles([...e.dataTransfer.files]); }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <b>{props.inline ? "Drop your box video here" : "Drop screenshots or a box video here"}</b>, paste {props.inline ? "it" : "them"} (Ctrl+V), or click to pick {props.inline ? "it" : "files"}.
          <div className="muted small">Any phone shape, several at once. Nothing is uploaded: it all runs in this browser.</div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { void takeFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
        {busy && (
          <div className="notice small">
            {busy} <button className="small-btn" onClick={() => { stop.current.stopped = true; }}>Stop</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {loadingUnits && !busy && (
          <div className="notice small">
            Loading the units' details to work out their builds… {loadingUnits.done}/{loadingUnits.total}
            {" "}<progress max={loadingUnits.total} value={loadingUnits.done} />
          </div>
        )}
        <div className="import-defaults">
          <span className="settings-label" title="Values no screenshot shows (e.g. potentials on a VS screen) come from these quick builds">For what the pictures don't show, use</span>
          <label>your units: <select value={defaults.mine} onChange={(e) => setDefaults({ ...defaults, mine: e.target.value })}>{props.presets.map((p) => <option key={p.label}>{p.label}</option>)}</select></label>
          {!props.inline && <label>opponents' units: <select value={defaults.theirs} onChange={(e) => setDefaults({ ...defaults, theirs: e.target.value })}>{props.presets.map((p) => <option key={p.label}>{p.label}</option>)}</select></label>}
        </div>
        {done && <p className="notice small">{done}</p>}

        {shots.map((s, i) => {
          const entries = s.tiles.map((_, k) => entry(s, k));
          return (
            <ShotView
              key={s.key}
              db={db}
              shot={s}
              entries={entries}
              boxName={boxName}
              onOpen={(list, j) => open(list.map((e) => [s.key, e.k]), j)}
              onKind={(k) => void reread(i, k)}
              onRemove={() => setShots((l) => l.filter((x) => x.key !== s.key))}
              act={{
                ...(props.onReplaceBox ? {
                  replaceBox: () => {
                    const ms = allOf(s);
                    props.onReplaceBox!(ms);
                    setDone(`${boxName} is now these ${ms.length} units, with what was read.`);
                  },
                } : {}),
                team: (group, side, label) => { props.onTeam(side, teamOf(s, group), label); setDone(`Loaded ${label}.`); },
                save: (groups, label) => {
                  props.onSave(groups.map((g) => ({ title: label(g), team: teamOf(s, g) })));
                  setDone(`Saved ${groups.length} team${groups.length === 1 ? "" : "s"} to My teams.`);
                },
                code: (group, label) => {
                  const c = encodeTeam({ title: label, authors: [], team: teamOf(s, group) });
                  void navigator.clipboard?.writeText(c).then(() => setDone(`Copied the code of ${label}: paste it in Teams → Load.`), () => setDone(`Code of ${label}: ${c}`));
                },
                box: (filter) => {
                  const ms = allOf(s, filter);
                  props.onBox(ms);
                  setDone(`Added ${ms.length} unit${ms.length === 1 ? "" : "s"} to ${boxName} with what was read (a unit already there gets this build).`);
                },
                recent: () => { const ms = allOf(s); props.onRecent(ms); setDone(`Added ${ms.length} unit${ms.length === 1 ? "" : "s"} to Recent units.`); },
                update: () => {
                  const ms = allOf(s);
                  const n = ms.reduce((a, m) => a + props.onUpdate(m), 0);
                  setDone(n ? `Updated ${n} place${n === 1 ? "" : "s"} on your teams.` : "That unit isn't on either team.");
                },
              }}
            />
          );
        })}
        {review && cur && (
          <UnitReview
            db={db}
            e={cur}
            at={review.i}
            of={review.list.length}
            boxName={boxName}
            maxCc={props.maxCc}
            onNav={(d) => setReview({ ...review, i: Math.max(0, Math.min(review.list.length - 1, review.i + d)) })}
            onClose={() => setReview(undefined)}
            onPick={(id) => setPick(cur.shot.key, cur.k, id)}
            onMember={(m) => setEdits((x) => { const n = { ...x }; const pk = placeKey(cur.shot.key, cur.k); if (m) n[pk] = m; else delete n[pk]; return n; })}
            onConfirm={() => {
              setChecked((c) => ({ ...c, [placeKey(cur.shot.key, cur.k)]: true }));
              // everything looked over is confirmed (a bulk change for unconfirmed stats leaves it alone)
              if (cur.member) setEdits((x) => ({ ...x, [placeKey(cur.shot.key, cur.k)]: withKnown(cur.member!, STAT_GROUPS) }));
              if (review.i < review.list.length - 1) setReview({ ...review, i: review.i + 1 });
            }}
            onBox={() => { const ms = unitsOf(cur); props.onBox(ms); setDone(`Saved ${unitLabel(db, cur.id!)} to ${boxName}.`); }}
            onRecent={() => { const ms = unitsOf(cur); props.onRecent(ms); setDone(`Added ${unitLabel(db, cur.id!)} to Recent units.`); }}
            onUpdate={() => { const n = unitsOf(cur).reduce((a, m) => a + props.onUpdate(m), 0); setDone(n ? `Updated ${n} place${n === 1 ? "" : "s"} on your teams.` : "That unit isn't on either team."); }}
          />
        )}
    </>
  );
  if (props.inline) return <section className="card import-inline"><h3>{props.inline.title}</h3>{body}</section>;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && !review && props.onClose()}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-label="Import from screenshots">
        <div className="modal-head">
          <h3>Import from screenshots</h3>
          <button className="link small" onClick={() => setHelp(!help)}>{help ? "Hide" : "What can I import?"}</button>
          <button className="icon" title="Close" onClick={close}>✕</button>
        </div>
        {body}
      </div>
    </div>
  );
}

/** How to record the box (My Boxes). */
function BoxVideoHelp() {
  return (
    <details className="import-help">
      <summary>How to record your box</summary>
      <ol className="small">
        <li>
          In the game's Select Character list, turn off the treasure / item type, set Rumble stats to "have" only and sort by type:
          <div className="help-shots">
            <figure><img src="import/examples/filter-type.webp" alt="Type filter: every type on except the treasure chest" loading="lazy" /><figcaption>Type: all but the treasure chest</figcaption></figure>
            <figure><img src="import/examples/filter-rumble-stats.webp" alt="Rumble stats filter: Have only" loading="lazy" /><figcaption>Rumble stats: Have</figcaption></figure>
            <figure><img src="import/examples/sort-type.webp" alt="Select Order: Type" loading="lazy" /><figcaption>Order: Type</figcaption></figure>
          </div>
        </li>
        <li>Record your screen while scrolling through the whole list at an easy pace (about a screen a second or slower).</li>
        <li>Drop the video here. Each unit's level, cotton candy total, Rumble key and filled sockets are read (and the Limit Break badge where no favorite star covers it). Tiles under the Auto Power Up button are skipped: they show up again as you scroll.</li>
        <li>The table lists the least sure units first: click one to check it (or fix it), or leave the rest to the defaults above. Then add them to the box or replace the box with them. Screenshots of the box, of teams or of unit pages work here too.</li>
      </ol>
    </details>
  );
}

/** A small example screenshot (public/import/examples/): click it to see it full size over the page (click or Esc closes). */
function Example({ name, alt }: { name: string; alt: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);
  return (
    <>
      <button type="button" className="help-thumb-btn" title="Show the example full size" onClick={() => setOpen(true)}>
        <img className="help-thumb" src={`import/examples/${name}-thumb.webp`} alt={`Example: ${alt}`} loading="lazy" />
        <span className="small">Enlarge</span>
      </button>
      {open && (
        <div className="help-lightbox" role="dialog" aria-label={`Example: ${alt}`} onMouseDown={(e) => { e.stopPropagation(); setOpen(false); }}>
          <img src={`import/examples/${name}.webp`} alt={`Example: ${alt}`} />
        </div>
      )}
    </>
  );
}

/** What each screenshot gives, and how to get it. */
function ImportHelp() {
  return (
    <details className="import-help" open>
      <summary>What each screenshot gives (and how to take it)</summary>
      <table className="import-help-table">
        <thead><tr><th>Screenshot</th><th>Where</th><th>Gives</th><th>Example</th></tr></thead>
        <tbody>
          <tr><td><b>Confirm Opponent (VS)</b></td><td>the screen just before a battle (also Assault Rumble's)</td><td>Both teams. The opponent's units and levels; your units' levels, cotton candy total, Rumble key, Limit Break badge and how many sockets have levels. The only whole-team picture of an opponent.</td><td><Example name="vs" alt="Confirm Opponent screen" /></td></tr>
          <tr><td><b>Team edit</b></td><td>Attack / Defense / Assault Rumble team edit (5 + 3 units)</td><td>Your team: levels, cotton candy total, key, Limit Break badge, filled sockets, and under each unit either HP / ATK / RCV or special, ability, DEF and SPD. <b>Take one of each display</b>: together they give the whole build.</td><td><Example name="team-edit" alt="Team edit screen showing HP / ATK / RCV" /></td></tr>
          {FEATURES.grandParty && <tr><td><b>Grand Party</b></td><td>your GP teams or an opponent's Info</td><td>All 3 teams as on the VS screen, and the leader (its position is shown). An opponent's teams can be hidden.</td><td /></tr>}
          <tr><td><b>Rumble status</b></td><td>a unit's Character Details → Rumble Stats</td><td>The exact Rumble stats, special and ability levels, level and max level. Works for opponents' units too.</td><td><Example name="rumble-status" alt="Character Details, Rumble status" /></td></tr>
          <tr><td><b>General status</b></td><td>a unit of yours: press and hold it → Character Details</td><td>The unit's number (so it's never mistaken), level, max level, main stats, special level (a red MAX: the Limit Break key is used), potentials and sockets. Only the left side of the page is read.</td><td><Example name="general-status" alt="Character Details, general status" /></td></tr>
          <tr><td><b>Box video</b></td><td>a screen recording of Select Character scrolling by (best in My Boxes)</td><td>Every unit of your box with its level, cotton candy total, key and filled sockets (the Limit Break badge too where no favorite star covers it).</td><td className="muted small">see How to record your box (My Boxes)</td></tr>
        </tbody>
      </table>
      <p className="muted small">
        Click any unit to check it: what was <span className="fact read">read</span>, what was <span className="fact worked">worked out</span>{" "}
        (the cotton candy split and potential / socket levels from the stats, the key from DEF and SPD…), what is a{" "}
        <span className="fact unknown">default</span> (from the builds chosen below) and what was <span className="fact manual">set by you</span>.
        Change anything there before loading a team. Screenshots of the same unit are combined.
      </p>
    </details>
  );
}

type Act = {
  replaceBox?: () => void;
  team: (group: string, side: "atk" | "def", label: string) => void;
  save: (groups: string[], label: (g: string) => string) => void;
  code: (group: string, label: string) => void;
  box: (filter?: (t: ReadTile) => boolean) => void;
  recent: () => void;
  update: () => void;
};

function ShotView(props: {
  db: UnitDb; shot: ReadShot; entries: Entry[]; boxName: string;
  onOpen: (list: Entry[], i: number) => void; onKind: (k: ScreenKind) => void; onRemove: () => void; act: Act;
}) {
  const { db, shot: s, entries, act } = props;
  const groups = [...new Set(s.tiles.map((t) => t.group))];
  const gp = s.kind === "gpTeam" || s.kind === "gpOpponent";
  const shown = groups.filter((g) => !s.hiddenGroups?.includes(g));
  const leader = s.tiles.findIndex((t) => t.leader);
  const leaderId = leader >= 0 ? entries[leader]?.id : undefined;
  const filled = entries.filter((e) => e.id != null);
  const look = filled.filter((e) => e.why.length);
  const name = (g: string) => groupLabel(s.kind, g);
  const teamKind = s.kind === "attackEdit" || s.kind === "vs" || s.kind === "vsAssault" || gp;
  const many = s.kind === "box" && s.tiles.length > 24;
  return (
    <section className="import-shot">
      <div className="import-head">
        <img src={s.preview} alt="" className="import-preview" />
        <div>
          <div className="unit-title">{s.name}</div>
          <label className="ed-row">
            <span>Screen</span>
            <select value={s.kind} disabled={!s.canvas} onChange={(e) => props.onKind(e.target.value as ScreenKind)}>
              {s.kind === "unknown" && <option value="unknown">not recognized</option>}
              {(Object.keys(SCREEN_NAMES) as ScreenKind[]).filter((k) => FEATURES.grandParty || !GP_KINDS.includes(k)).map((k) => <option key={k} value={k}>{SCREEN_NAMES[k]}</option>)}
            </select>
            {s.kind !== "unknown" && s.kindScore < 0.7 && <span className="muted small">(not sure: check)</span>}
          </label>
          <div className="muted small">
            {s.kind === "unknown" ? "Not a screen this can read: pick the screen above if it is one." : `${filled.length} unit${filled.length === 1 ? "" : "s"} found`}
            {look.length ? ` · ${look.length} worth a look (marked)` : filled.length ? " · all read cleanly" : ""}
            {" · click a unit to check or change it"}
          </div>
          {gp && (
            <div className="small">
              {leader < 0
                ? <span className="muted">No leader marker found.</span>
                : leaderId != null
                  ? <>Leader: <b>{unitLabel(db, leaderId)}</b> ({name(s.tiles[leader]!.group)}, position {s.tiles[leader]!.index + 1})</>
                  : <>Leader: {name(s.tiles[leader]!.group)}, position {s.tiles[leader]!.index + 1} <span className="muted">(hidden: pick the unit on the GP leader slot)</span></>}
              {s.hiddenGroups?.length ? <span className="muted"> · hidden: {s.hiddenGroups.map(name).join(", ")}</span> : null}
            </div>
          )}
          <div className="row-btns">
            <ShotActions shot={s} shown={shown} act={act} name={name} boxName={props.boxName} />
            <button className="link small danger" onClick={props.onRemove}>Remove</button>
          </div>
        </div>
      </div>
      {many ? (
        <BoxTable db={db} entries={entries} onOpen={props.onOpen} />
      ) : groups.map((g) => {
        const ge = entries.filter((e) => e.tile.group === g);
        const hidden = s.hiddenGroups?.includes(g);
        const bosses = s.kind === "vsAssault" && g === "opponent";
        return (
          <div key={g} className="import-group">
            <div className="import-group-head">
              {groups.length > 1 && <b className="small">{name(g)}</b>}
              {teamKind && !hidden && !bosses && ge.some((e) => e.id != null) && (
                <span className="row-btns small">
                  <button className="small-btn" onClick={() => act.team(g, "atk", `${name(g).toLowerCase()} as Your team`)}>→ Your team</button>
                  <button className="small-btn" onClick={() => act.team(g, "def", `${name(g).toLowerCase()} as the opponent`)}>→ Opponent</button>
                  <button className="small-btn" onClick={() => act.save([g], () => `Imported ${name(g).toLowerCase()}`)}>Save to My teams</button>
                  <button className="small-btn" onClick={() => act.code(g, `Imported ${name(g).toLowerCase()}`)} title="Copy a team code to share or load later">Copy code</button>
                </span>
              )}
              {bosses && <span className="muted small">Load the bosses with "Load from the game" in the Assault Rumble settings (exact stats).</span>}
            </div>
            {hidden
              ? <span className="muted small import-hidden">Hidden by the opponent{s.tiles.some((t) => t.group === g && t.leader) ? " (the leader is here)" : ""}.</span>
              : (
                <div className="import-tiles">
                  {ge.map((e, j) => <TileCard key={e.k} db={db} e={e} onClick={() => props.onOpen(ge, j)} />)}
                </div>
              )}
          </div>
        );
      })}
    </section>
  );
}

function groupLabel(kind: ReadShot["kind"], g: string): string {
  if (g === "opponent") return kind === "vsAssault" ? "Bosses" : "Opponent";
  if (g === "team") return kind === "vs" || kind === "vsAssault" ? "Your team" : "Team";
  if (g.startsWith("team")) return `${g.slice(4)}${["st", "nd", "rd"][Number(g.slice(4)) - 1] ?? "th"} team`;
  if (g === "box") return "Box";
  return "";
}

function ShotActions(props: { shot: ReadShot; shown: string[]; act: Act; name: (g: string) => string; boxName: string }) {
  const { shot, act } = props;
  const mine = (t: ReadTile) => !theirs(shot.kind, t.group);
  switch (shot.kind) {
    case "attackEdit": case "vs": case "vsAssault": return <button onClick={() => act.box(mine)}>Add your units to {props.boxName}</button>;
    case "gpTeam": case "gpOpponent": return (
      <>
        {props.shown.length > 1 && <button onClick={() => act.save(props.shown, (g) => `Imported GP ${props.name(g)}`)}>Save all {props.shown.length} teams to My teams</button>}
        {shot.kind === "gpTeam" && <button onClick={() => act.box()}>Add all to {props.boxName}</button>}
      </>
    );
    case "box": return (
      <>
        <button className="primary" onClick={() => act.box()} title="New units are added; units already in the box get the build read here">Add / update {shot.tiles.filter((t) => !t.empty).length} in {props.boxName}</button>
        {act.replaceBox && <button onClick={() => { if (confirm(`Replace everything in ${props.boxName} with these units?`)) act.replaceBox!(); }}>Replace {props.boxName} with these</button>}
      </>
    );
    case "details": case "rumbleDetails": return (
      <>
        <button className="primary" onClick={act.update}>Use this build on your teams</button>
        <button onClick={act.recent}>Add to Recent units</button>
        {shot.kind === "details" && <button onClick={() => act.box()}>Add to {props.boxName}</button>}
      </>
    );
    default: return null;
  }
}

/** A unit at a glance: level, cotton candy, key (only what's known), marked when worth a look. */
function glance(e: Entry): string {
  const m = e.member;
  if (!m || e.id == null) return "";
  const k = (g: StatGroup) => e.changed.includes(g) || !!m.known?.includes(g);
  const cc = m.ccMode === "custom" && m.cc ? m.cc.hp + m.cc.atk + m.cc.rcv : undefined;
  return [k("level") ? `Lv ${m.level}` : "Lv ?", k("cc") && cc ? `+${cc}` : null, k("rumbleKey") && m.rumbleKey ? "🔑" : null].filter(Boolean).join(" · ");
}

function TileCard(props: { db: UnitDb; e: Entry; onClick: () => void }) {
  const { db, e } = props;
  const rec = e.id != null ? db.byId.get(e.id) ?? db.byId.get(vsHalves(db, e.id)[0] ?? -1) : undefined;
  const cls = e.id == null ? "empty" : e.checked ? "checked" : e.why.length ? (e.build?.misfit ? "misfit" : "unsure") : "sure";
  return (
    <button type="button" className={`import-tile ${cls}`} onClick={props.onClick} title={`${e.id != null ? unitLabel(db, e.id) : "Empty"}${e.why.length ? ` — worth a look: ${e.why.join(", ")}` : ""}. Click to check or change it.`}>
      <img src={e.tile.crop} alt="" width={48} height={48} />
      <span className="import-pick">
        {rec ? <UnitThumb id={isVsCombined(db, e.id!) ? e.id! : rec.id} size={48} colorClass={colorClass(rec)} /> : <span className="import-empty">—</span>}
        {e.tile.leader && <span className="import-leader" title="GP leader">★</span>}
      </span>
      <span className="import-name">{e.id != null && rec ? unitLabel(db, e.id) : "empty"}</span>
      <span className="import-line">{e.checked ? "✓ " : ""}{glance(e)}{e.changed.length ? " ✎" : ""}</span>
    </button>
  );
}

const PAGE = 100;
/** A box's units as a table: least sure first (or in box order), the ones worth a look marked; click a row to check it. */
function BoxTable(props: { db: UnitDb; entries: Entry[]; onOpen: (list: Entry[], i: number) => void }) {
  const { db } = props;
  const [sort, setSort] = useState<"sure" | "box" | "name">("sure");
  const [only, setOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const all = props.entries.filter((e) => e.id != null);
  const look = all.filter((e) => e.why.length);
  const list = (only && look.length ? look : all).slice().sort((a, b) =>
    sort === "sure" ? a.sure - b.sure || a.k - b.k : sort === "name" ? unitLabel(db, a.id!).localeCompare(unitLabel(db, b.id!)) : a.k - b.k);
  const cell = (e: Entry, g: StatGroup, text: string) => {
    const m = e.member;
    const how = e.changed.includes(g) ? "manual" : m?.known?.includes(g) ? "read" : "unknown";
    return <td className={`box-cell ${how}`} title={how === "manual" ? "set by you" : how === "read" ? "read / worked out" : "default"}>{text}</td>;
  };
  return (
    <div className="box-table-wrap">
      <div className="row-btns small">
        <label className="check-row"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only the {look.length} worth a look</label>
        <label>Order <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="sure">least sure first</option><option value="box">as in the box</option><option value="name">by name</option></select></label>
        <span className="muted small">{all.length - look.length} of {all.length} read cleanly. Click a row to check or change that unit; the rest keep what was read and the defaults.</span>
      </div>
      <table className="box-table">
        <thead><tr><th /><th>Unit</th><th>Match</th><th>Level</th><th>LLB</th><th>Cotton candy</th><th>Key</th><th>Sockets</th><th>Limit Break</th><th>Check</th></tr></thead>
        <tbody>
          {list.slice(0, limit).map((e, i) => {
            const m = e.member;
            const rec = db.byId.get(e.id!) ?? db.byId.get(vsHalves(db, e.id!)[0] ?? -1);
            const cc = m?.ccMode === "custom" && m.cc ? `+${m.cc.hp + m.cc.atk + m.cc.rcv}` : m?.ccMode === "none" ? "none" : "acct max";
            return (
              <tr key={e.k} className={e.checked ? "checked" : e.why.length ? "look" : ""} onClick={() => props.onOpen(list, i)}>
                <td><img src={e.tile.crop} alt="" width={36} height={36} /></td>
                <td className="box-unit-cell">{rec && <UnitThumb id={isVsCombined(db, e.id!) ? e.id! : rec.id} size={28} colorClass={colorClass(rec)} />} <span>{unitLabel(db, e.id!)}</span></td>
                <td className={e.tile.match.score < SURE ? "warn" : ""}>{e.id === e.tile.match.id ? `${Math.round(e.tile.match.score * 100)}%` : "picked"}</td>
                {cell(e, "level", m?.level != null ? String(m.level) : "?")}
                {cell(e, "llb", String(m?.llbLevel ?? "?"))}
                {cell(e, "cc", cc)}
                {cell(e, "rumbleKey", m?.rumbleKey ? "🔑" : "—")}
                {cell(e, "sockets", m?.sockets != null ? String(m.sockets) : "?")}
                {cell(e, "lb", m?.lbNodes != null ? String(m.lbNodes) : "?")}
                <td className="small">{e.checked ? "✓ checked" : e.why.join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length > limit && <button className="link small" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} left)</button>}
    </div>
  );
}

const HOW_LABEL: Record<Fact["how"] | "manual", string> = { read: "read", worked: "worked out", unknown: "default", manual: "set by you" };

/**
 * One unit, checked before it's used: what was found (the crop), which unit it is (the best matches, any unit, or
 * empty), each stat and where it came from, the whole build to change, and where to save it. ← / → (or the buttons)
 * go through the units of the list it was opened from; Esc closes.
 */
function UnitReview(props: {
  db: UnitDb; e: Entry; at: number; of: number; boxName: string; maxCc?: TeamConfig["maxCc"];
  onNav: (d: number) => void; onClose: () => void; onPick: (id: number | null) => void; onMember: (m: MemberConfig | undefined) => void;
  onConfirm: () => void; onBox: () => void; onRecent: () => void; onUpdate: () => void;
}) {
  const { db, e } = props;
  const [changing, setChanging] = useState(false);
  const [, setLoaded] = useState(0);
  const uid = e.id != null ? vsHalves(db, e.id)[0] ?? e.id : undefined;
  const rec = uid != null ? db.byId.get(uid) : undefined;
  useEffect(() => { setChanging(false); }, [e.shot.key, e.k]);
  useEffect(() => { if (uid != null && !db.hasDetail(uid)) void db.ensure([uid]).then(() => setLoaded((n) => n + 1)); }, [uid, db]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
      if (ev.key === "Escape") { ev.preventDefault(); props.onClose(); }
      else if (!typing && ev.key === "ArrowRight") props.onNav(1);
      else if (!typing && ev.key === "ArrowLeft") props.onNav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const member = e.member ?? (uid != null ? { unitId: uid } : undefined);
  const score = e.id === e.tile.match.id ? e.tile.match.score : e.tile.match.alternatives.find((a) => a.id === e.id)?.score;
  const factRows = (e.build?.facts ?? []).map((f) => {
    const groups = FACT_GROUPS[f.what] ?? [];
    const manual = groups.some((g) => e.changed.includes(g));
    return { ...f, how: manual ? "manual" as const : f.how };
  });
  const changedOnly = e.changed.filter((g) => !factRows.some((f) => (FACT_GROUPS[f.what] ?? []).includes(g)));
  return (
    <div className="review-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && props.onClose()}>
      <div className="review" role="dialog" aria-modal="true" aria-label="Check a unit">
        <div className="review-head">
          <img src={e.tile.crop} alt="" width={64} height={64} title="As found in the picture" />
          <div className="review-title">
            {rec ? <UnitThumb id={isVsCombined(db, e.id!) ? e.id! : rec.id} size={64} colorClass={colorClass(rec)} /> : <span className="import-empty">—</span>}
            <div>
              <div className="unit-title">{e.id != null ? unitLabel(db, e.id) : "Empty place"}</div>
              <div className="muted small">
                {e.id != null && `#${e.id}${score != null ? ` · match ${Math.round(score * 100)}%` : " · picked by you"}`}
                {e.why.length ? ` · worth a look: ${e.why.join(", ")}` : ""}
              </div>
              <button className="link small" onClick={() => setChanging(!changing)}>{changing ? "Keep this unit" : "Wrong unit? Change it"}</button>
            </div>
          </div>
          <div className="review-nav">
            <button className="small-btn" disabled={props.at === 0} onClick={() => props.onNav(-1)} title="Previous (←)">‹</button>
            <span className="small muted">{props.at + 1} / {props.of}</span>
            <button className="small-btn" disabled={props.at >= props.of - 1} onClick={() => props.onNav(1)} title="Next (→)">›</button>
            <button className="icon" title="Close (Esc)" onClick={props.onClose}>✕</button>
          </div>
        </div>
        {changing && (
          <div className="review-change">
            <div className="review-alts">
              {[{ id: e.tile.match.id, score: e.tile.match.score }, ...e.tile.match.alternatives].map((a) => {
                const r = db.byId.get(a.id) ?? db.byId.get(vsHalves(db, a.id)[0] ?? -1);
                return (
                  <button key={a.id} className={a.id === e.id ? "on" : undefined} onClick={() => { props.onPick(a.id); setChanging(false); }} title={`#${a.id} ${unitLabel(db, a.id)}`}>
                    {r && <UnitThumb id={a.id} size={40} colorClass={colorClass(r)} />}
                    <span className="small">{unitLabel(db, a.id)}</span>
                    <span className="muted small">{Math.round(a.score * 100)}%</span>
                  </button>
                );
              })}
              <button onClick={() => { props.onPick(null); setChanging(false); }}>Empty</button>
            </div>
            <UnitSearch db={db} onCancel={() => setChanging(false)} onPick={(u) => { props.onPick(u.id); setChanging(false); }} />
          </div>
        )}
        {e.id != null && rec && member && (
          <>
            {e.build?.misfit && <p className="error small">{e.build.misfit}</p>}
            <table className="review-facts">
              <tbody>
                {factRows.map((f) => (
                  <tr key={f.what} title={f.note}>
                    <td className="muted">{f.what}</td>
                    <td>{f.how === "manual" ? (FACT_GROUPS[f.what] ?? []).map((g) => groupText(member, g)).join(" + ") : f.value}</td>
                    <td><span className={`fact ${f.how}`}>{HOW_LABEL[f.how]}</span></td>
                  </tr>
                ))}
                {changedOnly.map((g) => <tr key={g}><td className="muted">{GROUP_NAMES[g]}</td><td>{groupText(member, g)}</td><td><span className="fact manual">set by you</span></td></tr>)}
              </tbody>
            </table>
            <div className="review-actions row-btns">
              <button className="primary" onClick={props.onConfirm} title="Mark everything here as right and go to the next unit">✓ Looks right{props.at < props.of - 1 ? ", next" : ""}</button>
              <button onClick={props.onBox}>Save to {props.boxName}</button>
              <button onClick={props.onRecent}>Add to Recent units</button>
              <button onClick={props.onUpdate} title="Replace this unit's build wherever it is on your teams">Use on your teams</button>
              {e.changed.length > 0 && <button className="link small" onClick={() => props.onMember(undefined)}>Undo my changes</button>}
            </div>
            <div className="review-edit">
              {db.hasDetail(rec.id) ? (
                <UnitSettings
                  db={db} unit={rec} member={member} team={{ members: [], ...(props.maxCc ? { maxCc: props.maxCc } : {}) }} index={0}
                  onChange={(m) => props.onMember(withKnown(m, changedGroups(member, m)))}
                />
              ) : <p className="muted small">Loading {rec.name}…</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
