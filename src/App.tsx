import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { loadUnitDb, type UnitDb } from "./data/unitDb";
import type { WinRateSummary } from "./sim/simulate";
import type { SimResult } from "./sim/types";
import { KIZARU_ATTACKERS, NYDATO_AUTHOR, NYDATO_DATE, NYDATO_TEAMS, ROBIN_ATTACKERS, TEST_TEAMS, USOHACHI_ATTACKERS } from "./engine/defaultTeams";
import { placementProblem, validateTeam } from "./engine/team";
import { DEFAULT_PRESETS, MAX_CC, MIN_ACCOUNT_CC, type PresetDef } from "./engine/stats";
import { AccountCc } from "./ui/AccountCc";
import type { MemberConfig, TeamConfig } from "./engine/types";
import type { WorkerRequest, WorkerResponse } from "./sim.worker";
import { PresetEditor } from "./ui/PresetEditor";
import { RulesEditor } from "./ui/RulesEditor";
import { APP_DEFAULT_RULES, type GlobalRule } from "./engine/rules";
import { DEV_EXTRAS } from "./devExtras";
import { FEATURES } from "./features";
import { RecentPanel } from "./ui/RecentPanel";
import { SavedTeamsList, TeamsDialog, SIDE_NAMES, type Side } from "./ui/TeamLibrary";
import { AUTHOR_MAX, AUTHOR_PLACEHOLDER, cleanAuthor, teamOnly, type SavedTeam, type TeamShare } from "./engine/teamCode";
import { DefaultBuild, SearchOptions, TeamEditor, type BoxLink, type Dnd, type SlotRef } from "./ui/TeamEditor";
import { usePersistedChoice, usePersistedFlag } from "./ui/persist";
import type { GameMode } from "./engine/types";
import { bossFromUnit, bossMember, BOSS_TEAM_MAX, newBossId, registerBosses, type BossDef } from "./engine/boss";
import { migrateAssault, type AssaultSettings } from "./engine/assault";
import { DEFAULT_GP_BOOST, type GpOptions } from "./engine/gp";
import { AssaultSettingsEditor, BattleScore, GameBossLoader, ScoreSummary } from "./ui/AssaultPanel";
import { assaultLevelMult } from "./engine/gameKit";
import { BossEditor } from "./ui/BossEditor";
import { BurstGraph, GpSettings, LeaderSlot } from "./ui/GpPanel";
import type { RunModeOptions } from "./sim/simulate";
import { RuleSets } from "./ui/RuleSets";
import { BossTeamsDialog, type BossTeamShare, type SavedBossTeam } from "./ui/BossTeams";
import { loadRumbleRules, stageAt, stageRules } from "./engine/gameRules";
import { BoxesPage, mergeIntoBox, migrateBoxes, type Boxes } from "./ui/BoxesPage";

/** The battle replay (field art, SVG field layer) is a large chunk, loaded only once a battle is shown. */
const Replay = lazy(() => import("./ui/Replay").then((m) => ({ default: m.Replay })));
// Loaded after the first screen (their own chunks): the team generator (always mounted, so it follows at once) and the
// screenshot import (when it is opened). The simulator itself loads with the first single battle (runOne).
const GeneratorPanel = lazy(() => import("./ui/Generator").then((m) => ({ default: m.GeneratorPanel })));
const ImportDialog = lazy(() => import("./ui/ImportDialog").then((m) => ({ default: m.ImportDialog })));

const STORAGE_KEY = "rumble-sim-teams-v3";
/** Game mode, and each mode's own teams (Rumble keeps the old key). */
const MODE_KEY = "rumble-sim-mode";
const MODES = ([
  ["rumble", "Pirate Rumble", "Regular Rumble battles: your team attacks the opponent's"],
  ["gp", "Grand Party", "Each team has a leader whose GP ability and burst apply"],
  ["assault", "Assault Rumble", "Your team against up to 4 bosses that never go down: play for the score"],
] as [GameMode, string, string][]).filter(([m]) => m !== "gp" || FEATURES.grandParty); // Grand Party: not released yet (src/features.ts)
const teamsKey = (m: GameMode) => (m === "rumble" ? STORAGE_KEY : `rumble-sim-teams-${m}-v1`);
const GP_KEY = "rumble-sim-gp-v1";
/** "My box": the units you own (team generator, screenshot import); one box, before My Boxes. */
const BOX_KEY = "rumble-sim-box-v1";
/** My Boxes: several named boxes and the one in use (2026-11-23). */
const BOXES_KEY = "rumble-sim-boxes-v1";
/** The page shown: the simulator (in its game mode) or My Boxes. */
const VIEW_KEY = "rumble-sim-view";
/** The quick build new units get (and the import / generator start from): "Lv 99" unless changed (user, 2026-11-23). */
const DEFAULT_BUILD_KEY = "rumble-sim-default-build";
const ASSAULT_KEY = "rumble-sim-assault-v1";
const RECENT_KEY = "rumble-sim-recent-v1";
const PRESETS_KEY = "rumble-sim-presets-v1";
/** Night mode: follow the system ("auto"), or always light / dark [user 2026-11-18]. */
type Theme = "auto" | "light" | "dark";
const THEME_KEY = "rumble-sim-theme";
const THEMES: [Theme, string, string][] = [
  ["auto", "Auto", "Follow your system's light / dark setting"],
  ["light", "Off", "Always light"],
  ["dark", "On", "Always dark"],
];
/** data-theme on <html>: the stylesheet's dark colors apply with "dark", or with the system's dark mode unless "light". */
function applyTheme(t: Theme) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
const SAVED_TEAMS_KEY = "rumble-sim-saved-teams-v1";
/** Set once the test runs' teams / units have been added to Saved teams / Recent units (so deleting them sticks). */
const TEST_TEAMS_KEY = "rumble-sim-test-teams-added-v1";
const TEST_UNITS_KEY = "rumble-sim-test-units-added-v1";
/** Set once Nydato's teams have been added to Saved teams. */
const NYDATO_TEAMS_KEY = "rumble-sim-nydato-teams-added-v1";
/** Which of Nydato's teams have been added to Saved teams (new ones from a sheet update get added; deleted stay deleted). */
const NYDATO_ADDED_KEY = "rumble-sim-nydato-added-v2";
const AUTHOR_KEY = "rumble-sim-default-author";
const SAVED_TEAMS_MAX = 200;
const PANEL_KEY = "rumble-sim-panel-widths";
const RULES_KEY = "rumble-sim-global-rules-v1";
/** Pirate Rumble rules follow the game's stage of the day (default) or are the user's own. */
const RULES_FOLLOW_KEY = "rumble-sim-rules-follow-v1";
/** Assault Rumble's own rules (they come with the boss team), and the saved boss teams. */
const ASSAULT_RULES_KEY = "rumble-sim-assault-rules-v1";
const BOSS_TEAMS_KEY = "rumble-sim-saved-boss-teams-v1";
/** Your account's cotton candy maximum: a site setting, for every mode's team. */
const ACCOUNT_CC_KEY = "rumble-sim-account-cc-v1";
/** Side panel width while a team's settings are open, and (wider) while both teams are collapsed. */
const PANEL_DEFAULTS = { narrow: 250, wide: 400 };
const RECENT_MAX = 30;

function loadJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: just won't persist */
  }
}

/**
 * Stored copies of test run 6's Kizaru (exact stats HP 9,005) saved before he was marked LLB 4 get llbLevel 4, so his
 * LLB ability (Shooter HP up) and LLB special apply. Leaves every other member alone.
 */
const fixMember = <M extends MemberConfig | null>(m: M): M =>
  m && m.unitId === 3704 && m.exact?.hp === 9005 && m.llbLevel == null ? { ...m, llbLevel: 4 } : m;
const fixTeam = (t: TeamConfig): TeamConfig => ({ ...t, members: t.members.map(fixMember) });

/** Developer only (src/devExtras.ts): Kizaru 3704, Usohachi 2806, Luffy 2087, King 3137, Nico Robin 4375 as recorded. */
const TEST_UNITS = [KIZARU_ATTACKERS.members[0]!, USOHACHI_ATTACKERS.members[0]!, ...ROBIN_ATTACKERS.members.slice(0, 3)] as MemberConfig[];
const isTestUnit = (m: MemberConfig) => TEST_UNITS.some((u) => JSON.stringify(u) === JSON.stringify(m));
const isTestTeam = (e: SavedTeam) => TEST_TEAMS.some((t) => t.id === e.id);

/** Nydato's teams as saved teams (title, author, made 2026-11-14). */
const NYDATO_SAVED: SavedTeam[] = NYDATO_TEAMS.map((t, i) => ({ id: t.id, title: t.title, authors: [NYDATO_AUTHOR], team: t.team, savedAt: NYDATO_DATE - i }));
/** First visit: Nydato's Cerebral Free Spirit attacks his STR team. */
const withMeta = (e: SavedTeam): TeamConfig => ({ ...e.team, meta: { title: e.title, authors: e.authors } });
const nydatoSaved = (id: string) => NYDATO_SAVED.find((t) => t.id === id) ?? NYDATO_SAVED[0]!;
const firstTeams = { atk: withMeta(nydatoSaved("nydato-cerebral-free-spirit")), def: withMeta(nydatoSaved("nydato-str")) };

/** A new boss before the editor: based on Luffy until a unit is picked or copied. */
const newBossDraft = (): BossDef => ({
  id: newBossId(), baseId: 1, name: "New boss", color: "[STR]", classes: ["Fighter"], tags: [], families: [], style: "ATK",
  stats: { hp: 1_000_000, atk: 5_000, rcv: 500, def: 200, spd: 150 },
  abilities: [], special: { cooldown: 30, effects: [] }, pattern: [{ action: "attack", type: "Normal" }], resilience: [], target: { criteria: "near" },
});

/** Always 8 positions (null = empty). */
/** Eight places; a boss team keeps only its first BOSS_TEAM_MAX places (older saves could hold a 5th boss). */
const pad = (t: TeamConfig): TeamConfig => ({
  ...t, members: Array.from({ length: 8 }, (_, i) => { const m = t.members[i] ?? null; return m?.boss && i >= BOSS_TEAM_MAX ? null : m; }),
});

function loadSaved(mode: GameMode = "rumble"): { atk: TeamConfig; def: TeamConfig } | undefined {
  try {
    const raw = localStorage.getItem(teamsKey(mode));
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { atk: TeamConfig; def: TeamConfig };
    return { atk: fixTeam(v.atk), def: fixTeam(v.def) };
  } catch {
    return undefined;
  }
}

/** Loads the lightweight unit index, then runs the simulator app. The 10 MB database is no longer bundled. */
export function App() {
  const [db, setDb] = useState<UnitDb>();
  const [loadError, setLoadError] = useState<string>();
  useEffect(() => {
    let live = true;
    loadUnitDb().then((d) => live && setDb(d), (e) => live && setLoadError(String(e)));
    return () => { live = false; };
  }, []);
  if (loadError) return <div className="app-loading error">Couldn't load the unit database: {loadError}</div>;
  if (!db) return <div className="app-loading" role="status">Loading units…</div>;
  return <Sim db={db} />;
}

/** A mode's teams on a first visit: Nydato's teams; Grand Party gives them leaders; Assault Rumble starts with no bosses. */
function firstTeamsFor(mode: GameMode): { atk: TeamConfig; def: TeamConfig } {
  if (mode === "gp") return { atk: { ...firstTeams.atk, leader: { member: { unitId: 4560 } } }, def: { ...firstTeams.def, leader: { member: { unitId: 4442 } } } };
  if (mode === "assault") return { atk: firstTeams.atk, def: { members: [] } };
  return firstTeams;
}

function Sim({ db }: { db: UnitDb }) {
  const [mode, setModeRaw] = usePersistedChoice<GameMode>(MODE_KEY, MODES.map(([m]) => m), "rumble");
  const saved = useMemo(() => loadSaved(mode), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [atk, setAtkRaw] = useState<TeamConfig>(pad(saved?.atk ?? firstTeamsFor(mode).atk));
  const [def, setDefRaw] = useState<TeamConfig>(pad(saved?.def ?? firstTeamsFor(mode).def));
  const [gp, setGp] = useState<GpOptions>(() => {
    const g = loadJson<GpOptions>(GP_KEY) ?? { boost: DEFAULT_GP_BOOST };
    // the first default boost had two stats (ATK, HP: a guess); the season's picture shows six (2026-11-22)
    const old = g.boost?.rules.length === 2 && g.boost.rules.every((r) => r.effect.kind === "buff" && ["ATK", "HP"].includes(r.effect.attr) && r.effect.level === 5);
    return old ? { ...g, boost: { ...g.boost!, rules: DEFAULT_GP_BOOST.rules } } : g;
  });
  const [assault, setAssault] = useState<AssaultSettings>(() => migrateAssault(loadJson<AssaultSettings>(ASSAULT_KEY)));
  /** The boss being edited (Assault Rumble): its position on the boss team, and whether it's new. */
  const [bossEdit, setBossEdit] = useState<{ index: number; boss: BossDef; isNew: boolean }>();
  const [boxes, setBoxes] = useState<Boxes>(() => migrateBoxes(loadJson<Boxes>(BOXES_KEY), loadJson<MemberConfig[]>(BOX_KEY)));
  /** The box in use (team generator, owned trusty bonus, import). */
  const box = (boxes.list.find((b) => b.id === boxes.active) ?? boxes.list[0]!).units;
  const setBox = (f: MemberConfig[] | ((b: MemberConfig[]) => MemberConfig[])) =>
    setBoxes((all) => ({ ...all, list: all.list.map((b) => (b.id === all.active ? { ...b, units: typeof f === "function" ? f(b.units) : f } : b)) }));
  const boxName = (boxes.list.find((b) => b.id === boxes.active) ?? boxes.list[0]!).name;
  /** Changing a box unit's build on a team changes it in the box too (user, 2026-11-25). */
  const [boxSync, setBoxSync] = usePersistedFlag("rumble-sim-box-sync", true);
  /** The team generator is running (switching game mode stops it). */
  const [genRunning, setGenRunning] = useState(false);
  const [defaultBuildLabel, setDefaultBuildLabel] = useState(() => loadJson<string>(DEFAULT_BUILD_KEY) ?? "Lv 99");
  useEffect(() => saveJson(DEFAULT_BUILD_KEY, defaultBuildLabel), [defaultBuildLabel]);
  const [view, setView] = usePersistedChoice<"sim" | "boxes">(VIEW_KEY, ["sim", "boxes"], "sim");
  /** A box video being read in My Boxes: it keeps going (the page stays on, hidden) while you're elsewhere. */
  const [boxBusy, setBoxBusy] = useState<{ text: string; stop: () => void }>();
  /** My Boxes kept on out of sight: from a read started there until you come back to it once it's done. */
  const [boxesHeld, setBoxesHeld] = useState(false);
  useEffect(() => { if (boxBusy) setBoxesHeld(true); else if (view === "boxes") setBoxesHeld(false); }, [boxBusy, view]);
  const [importing, setImporting] = useState(false);
  const setAtk = (t: TeamConfig) => setAtkRaw(pad(t));
  const setDef = (t: TeamConfig | ((cur: TeamConfig) => TeamConfig)) => setDefRaw((cur) => pad(typeof t === "function" ? t(cur) : t));
  const [recent, setRecent] = useState<MemberConfig[]>(() => {
    // The test runs' special units with their exact recorded stats: developer only (src/devExtras.ts), added once
    const list = (loadJson<MemberConfig[]>(RECENT_KEY) ?? []).map(fixMember);
    if (!DEV_EXTRAS) return list.filter((m) => !isTestUnit(m));
    if (loadJson<boolean>(TEST_UNITS_KEY)) return list;
    return [...TEST_UNITS, ...list.filter((m) => !isTestUnit(m))].slice(0, RECENT_MAX);
  });
  const [recentOpen, setRecentOpen] = useState(true);
  const [sideTab, setSideTab] = useState<"recent" | "teams" | "box">("recent");
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>(() => {
    // Nydato's teams and the recorded test runs' teams, each added once (deleting one keeps it deleted)
    let list = (loadJson<SavedTeam[]>(SAVED_TEAMS_KEY) ?? []).map((e) => ({ ...e, team: fixTeam(e.team) }));
    // Nydato's teams: each added once (the first three by the old flag); one already saved follows the sheet's update
    const added = new Set(loadJson<string[]>(NYDATO_ADDED_KEY) ?? (loadJson<boolean>(NYDATO_TEAMS_KEY) ? ["nydato-str", "nydato-cerebral-free-spirit", "nydato-qck"] : []));
    list = list.map((e) => NYDATO_SAVED.find((t) => t.id === e.id) ?? e);
    list = [...NYDATO_SAVED.filter((t) => !added.has(t.id) && !list.some((e) => e.id === t.id)), ...list];
    // the recorded test runs' teams: developer only (src/devExtras.ts)
    if (!DEV_EXTRAS) return list.filter((e) => !isTestTeam(e));
    if (loadJson<boolean>(TEST_TEAMS_KEY)) return list;
    const add = TEST_TEAMS.filter((t) => !list.some((e) => e.id === t.id))
      .map((t, i): SavedTeam => ({ id: t.id, title: t.title, authors: ["Test runs"], team: t.team, savedAt: Date.now() - i }));
    return [...list, ...add];
  });
  const [defaultAuthor, setDefaultAuthor] = useState<string>(() => loadJson<string>(AUTHOR_KEY) ?? "");
  const [library, setLibrary] = useState<{ side: Side; mode: "save" | "load" }>();
  const [openTeams, setOpenTeams] = useState({ atk: false, def: false });
  const [rules, setRules] = useState<GlobalRule[]>(() => (loadJson<GlobalRule[]>(RULES_KEY) ?? APP_DEFAULT_RULES).filter((r) => !r.source?.startsWith("assault:")));
  // the game's rules of the day by default; rules a user saved before (other than the old default) stay theirs
  const [rulesFollow, setRulesFollow] = useState<boolean>(() => {
    const f = loadJson<boolean>(RULES_FOLLOW_KEY);
    if (f !== undefined) return f;
    // (assault rules kept with them by an earlier version don't count)
    const saved = loadJson<GlobalRule[]>(RULES_KEY)?.filter((r) => !r.source?.startsWith("assault:"));
    return !saved || JSON.stringify(saved) === JSON.stringify(APP_DEFAULT_RULES);
  });
  const [assaultRules, setAssaultRules] = useState<GlobalRule[]>(() => loadJson<GlobalRule[]>(ASSAULT_RULES_KEY) ?? (loadJson<GlobalRule[]>(RULES_KEY) ?? []).filter((r) => r.source?.startsWith("assault:")));
  const [savedBossTeams, setSavedBossTeams] = useState<SavedBossTeam[]>(() => loadJson<SavedBossTeam[]>(BOSS_TEAMS_KEY) ?? []);
  const [bossLibrary, setBossLibrary] = useState(false);
  const [panelWidths, setPanelWidths] = useState(() => ({ ...PANEL_DEFAULTS, ...loadJson<typeof PANEL_DEFAULTS>(PANEL_KEY) }));
  // More room for the side panel when neither team's settings are open.
  const panelMode = openTeams.atk || openTeams.def ? "narrow" : "wide";
  const [dragging, setDragging] = useState<SlotRef>();
  const [notice, setNotice] = useState<string>();
  const [theme, setTheme] = usePersistedChoice<Theme>(THEME_KEY, ["auto", "light", "dark"], "auto");
  useEffect(() => applyTheme(theme), [theme]);
  const potentialList = db.potentialNames;
  const [presets, setPresets] = useState<PresetDef[]>(() => {
    const saved = loadJson<PresetDef[]>(PRESETS_KEY);
    // Older saved builds used total potential/socket levels: start those over from the defaults.
    if (!saved || !saved.every((p) => typeof p.potentialLevel === "number")) return DEFAULT_PRESETS;
    // Builds saved before the cotton candy choice: the default build of the same name's choice, else keep.
    // Builds saved before the premium potentials choice: the default build of the same name's potentials, else off.
    return saved.map((p) => {
      const d = DEFAULT_PRESETS.find((x) => x.label === p.label);
      const q = p.cc ? p : { ...p, cc: d?.cc ?? "keep" };
      return q.premiumPotentials !== undefined ? q : { ...q, premiumPotentials: d?.premiumPotentials ?? false, ...(d ? { potentialLevel: d.potentialLevel } : {}) };
    });
  });
  const [seed, setSeed] = useState(1);
  const [battles, setBattles] = useState(1000);
  const [single, setSingle] = useState<SimResult>();
  const [singleSeed, setSingleSeed] = useState(seed); // the seed the shown battle ran with
  const [summary, setSummary] = useState<WinRateSummary>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  /** Win rate after each progress update (battles, rate), for the live trace. */
  const [history, setHistory] = useState<{ n: number; p: number }[]>([]);
  const [stopped, setStopped] = useState<{ done: number; total: number }>();
  const [error, setError] = useState<string>();
  const [showSettings, setShowSettings] = useState(false);
  const [hideFiveStar, setHideFiveStar] = usePersistedFlag("rumble-sim-search-hide-5star", true);
  const searchOptions = useMemo(() => ({ hideFiveStar }), [hideFiveStar]);

  useEffect(() => saveJson(teamsKey(mode), { atk, def }), [atk, def]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => saveJson(GP_KEY, gp), [gp]);
  useEffect(() => saveJson(BOXES_KEY, boxes), [boxes]);
  useEffect(() => saveJson(ASSAULT_KEY, assault), [assault]);
  /** Switch game mode: each mode keeps its own teams; results of the other mode are cleared. */
  const setMode = (m: GameMode) => {
    if (m !== mode && genRunning && !confirm(`The team generator is still running. Switching to ${MODES.find((x) => x[0] === m)?.[1] ?? "another mode"} stops it, and what it has found so far is lost. Switch anyway?`)) return;
    setView("sim");
    if (m === mode) return;
    saveJson(teamsKey(mode), { atk, def });
    const t = loadSaved(m) ?? firstTeamsFor(m);
    setModeRaw(m);
    const acct = loadJson<TeamConfig["maxCc"]>(ACCOUNT_CC_KEY) ?? atk.maxCc;
    setAtkRaw(pad({ ...t.atk, ...(acct ? { maxCc: acct } : {}) }));
    setDefRaw(pad(t.def));
    setSingle(undefined);
    setSummary(undefined);
    setProgress(undefined);
    setStopped(undefined);
    stopWorkers();
  };
  useEffect(() => saveJson(RECENT_KEY, recent), [recent]);
  useEffect(() => saveJson(PRESETS_KEY, presets), [presets]);
  useEffect(() => saveJson(SAVED_TEAMS_KEY, savedTeams), [savedTeams]);
  // the test runs' teams and units are in the lists now (set here, not in the initializers: dev mode runs those twice)
  useEffect(() => {
    saveJson(NYDATO_TEAMS_KEY, true);
    saveJson(NYDATO_ADDED_KEY, [...new Set([...(loadJson<string[]>(NYDATO_ADDED_KEY) ?? []), ...NYDATO_SAVED.map((t) => t.id)])]);
    // with the developer extras off they're not in the lists; forget they were added, so turning them on adds them again
    for (const k of [TEST_TEAMS_KEY, TEST_UNITS_KEY]) if (DEV_EXTRAS) saveJson(k, true); else try { localStorage.removeItem(k); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => saveJson(AUTHOR_KEY, defaultAuthor), [defaultAuthor]);
  useEffect(() => saveJson(PANEL_KEY, panelWidths), [panelWidths]);
  useEffect(() => saveJson(RULES_KEY, rules), [rules]);
  useEffect(() => saveJson(RULES_FOLLOW_KEY, rulesFollow), [rulesFollow]);
  useEffect(() => saveJson(ASSAULT_RULES_KEY, assaultRules), [assaultRules]);
  useEffect(() => saveJson(BOSS_TEAMS_KEY, savedBossTeams), [savedBossTeams]);
  // following the game: today's stage's rules on every visit
  useEffect(() => {
    if (!rulesFollow) return;
    let live = true;
    loadRumbleRules().then((f) => { const st = stageAt(f); if (live && st) setRules(stageRules(f, st).rules); }, () => { /* no game data: keep the rules */ });
    return () => { live = false; };
  }, [rulesFollow]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(undefined), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  /**
   * Put a unit (with its levels and upgrades) at the front of Recent units. Copies of a character are kept (different
   * builds of one unit); only a whole team replaced by Load skips exact duplicates.
   */
  const remember = (list: MemberConfig[], m: MemberConfig) => [m, ...list].slice(0, RECENT_MAX);
  const rememberOnce = (list: MemberConfig[], m: MemberConfig) => {
    const key = JSON.stringify(m);
    return [m, ...list.filter((x) => JSON.stringify(x) !== key)].slice(0, RECENT_MAX);
  };
  const retire = (m: MemberConfig) => setRecent((r) => remember(r, m));

  /** Save a team to the local history (newest first) and tag the team with its title and authors. */
  const saveTeam = (side: Side, share: TeamShare) => {
    const entry: SavedTeam = { ...share, team: teamOnly(share.team), id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: Date.now() };
    setSavedTeams((list) => [entry, ...list].slice(0, SAVED_TEAMS_MAX));
    const t = side === "atk" ? atk : def;
    setTeam(side, { ...t, meta: { title: share.title, authors: share.authors } });
    setNotice(`Saved “${share.title || "Untitled team"}” to history.`);
  };
  /** Load a team into a side. The units it replaces move to Recent units. */
  const loadTeam = (share: TeamShare, side: Side) => {
    const old = side === "atk" ? atk : def;
    const moved = old.members.filter((m): m is MemberConfig => !!m);
    if (moved.length) setRecent((r) => [...moved].reverse().reduce(rememberOnce, r));
    setTeam(side, { ...teamOnly(share.team), meta: { title: share.title, authors: share.authors } });
    setLibrary(undefined);
    setNotice(`Loaded “${share.title || "Untitled team"}” into ${SIDE_NAMES[side]}${moved.length ? `. Its previous ${moved.length} unit${moved.length === 1 ? "" : "s"} moved to Recent units` : ""}.`);
  };
  const savedList = (compact: boolean) => (
    <SavedTeamsList
      db={db}
      saved={savedTeams}
      teams={{ atk, def }}
      compact={compact}
      onLoad={loadTeam}
      onDelete={(id) => setSavedTeams((l) => l.filter((e) => e.id !== id))}
    />
  );

  // Assault Rumble bosses get a unit record (portrait, lists, the simulator), wherever they are
  registerBosses(db, [atk, def, { members: recent }]);
  const teams = { atk, def };
  const setTeam = (side: "atk" | "def", t: TeamConfig) => (side === "atk" ? setAtk(t) : setDef(t));
  const bossTeam = (side: "atk" | "def") => mode === "assault" && side === "def";
  /** Make a boss from a regular unit (dropped on the boss team). */
  const toBoss = async (m: MemberConfig): Promise<MemberConfig> => {
    if (m.boss) return m;
    await db.ensure([m.unitId]);
    const b = bossFromUnit(db.byId.get(m.unitId)!, newBossId(def.members.map((x) => x?.unitId ?? 0)));
    b.stats.hp = Math.max(b.stats.hp, 1_000_000);
    return bossMember(b);
  };
  const label = (m: MemberConfig) => db.byId.get(m.unitId)?.name.split(" - ")[0] ?? `#${m.unitId}`;

  /**
   * Drag and drop: team ↔ team swaps the two positions (empty positions too); Recent → team puts that unit in
   * (the unit there goes to Recent); team → Recent takes the unit off the team. Moves that would break the
   * duplicate / family / cost rules for a legal unit are refused.
   */
  const moveUnit = (src: SlotRef, dst: SlotRef) => {
    if (src.from === dst.from && src.index === dst.index) return;
    if (dst.from === "box") return;
    // a box unit: a copy of it goes where it's dropped (the box keeps it); the unit it replaces goes to Recent
    if (src.from === "box") {
      const m = box[src.index];
      if (!m) return;
      const copy = { ...m };
      if (dst.from === "recent") { setRecent((r) => remember(r, copy)); return; }
      if (bossTeam(dst.from)) {
        if (dst.index >= BOSS_TEAM_MAX) return;
        void toBoss(copy).then((bm) => {
          setDef((cur) => ({ ...cur, members: cur.members.map((x, i) => (i === dst.index ? bm : x)) }));
          setNotice(`Made a boss from ${label(copy)}: click it to edit.`);
        });
        return;
      }
      const dt = teams[dst.from];
      const there = dt.members[dst.index] ?? null;
      const why = placementProblem(db, dt, dst.index, copy);
      if (why) return setNotice(`Can't put ${label(copy)} there: ${why}.`);
      setTeam(dst.from, { ...dt, members: dt.members.map((x, i) => (i === dst.index ? copy : x)) });
      if (there) setRecent((r) => remember(r, there));
      return;
    }
    if (src.from === "recent" && dst.from === "recent") return;
    const srcMember = src.from === "recent" ? recent[src.index] : teams[src.from].members[src.index];
    // Assault Rumble: a unit dropped on the boss team becomes a boss (a copy: the original stays where it was);
    // a boss can't join a regular team
    if (dst.from !== "recent" && bossTeam(dst.from) && src.from !== dst.from) {
      if (!srcMember || dst.index >= BOSS_TEAM_MAX) return;
      void toBoss(srcMember).then((b) => {
        setDef((cur) => ({ ...cur, members: cur.members.map((x, i) => (i === dst.index ? b : x)) }));
        setNotice(`Made a boss from ${label(srcMember)}: click it to edit.`);
      });
      return;
    }
    if (dst.from !== "recent" && !bossTeam(dst.from) && srcMember?.boss) return setNotice("A boss can only go on the boss team.");
    if (dst.from === "recent" && src.from !== "recent" && bossTeam(src.from)) {
      const m = teams[src.from].members[src.index];
      if (m) { retire(m); setDef({ ...def, members: def.members.map((x, i) => (i === src.index ? null : x)) }); }
      return;
    }
    if (dst.from === "recent") {
      if (src.from === "recent") return;
      const t = teams[src.from];
      const m = t.members[src.index];
      if (!m) return;
      retire(m);
      setTeam(src.from, { ...t, members: t.members.map((x, i) => (i === src.index ? null : x)) });
      return;
    }
    const dt = teams[dst.from];
    const there = dt.members[dst.index] ?? null;
    if (src.from === "recent") {
      const m = recent[src.index];
      if (!m) return;
      const why = placementProblem(db, dt, dst.index, m);
      if (why) return setNotice(`Can't put ${label(m)} there: ${why}.`);
      setTeam(dst.from, { ...dt, members: dt.members.map((x, i) => (i === dst.index ? m : x)) });
      setRecent((r) => {
        const rest = r.filter((_, i) => i !== src.index);
        return there ? remember(rest, there) : rest;
      });
      return;
    }
    const st = teams[src.from];
    const moving = st.members[src.index] ?? null;
    if (!moving) return;
    if (src.from === dst.from) {
      const members = [...st.members];
      members[src.index] = there;
      members[dst.index] = moving;
      setTeam(src.from, { ...st, members });
      return;
    }
    // Across teams: each unit has to fit its new team.
    const newDst = { ...dt, members: dt.members.map((x, i) => (i === dst.index ? moving : x)) };
    const newSrc = { ...st, members: st.members.map((x, i) => (i === src.index ? there : x)) };
    const why = placementProblem(db, dt, dst.index, moving) ?? (there ? placementProblem(db, st, src.index, there) : undefined);
    if (why) return setNotice(`Can't swap: ${why}.`);
    setTeam(dst.from, newDst);
    setTeam(src.from, newSrc);
  };
  const dnd: Dnd = {
    dragging,
    start: (s) => setDragging(s),
    end: () => setDragging(undefined),
    drop: (d) => {
      if (dragging) moveUnit(dragging, d);
      setDragging(undefined);
    },
  };

  const workers = useRef<Worker[]>([]);
  const job = useRef(0);
  const stopWorkers = () => { for (const w of workers.current) w.terminate(); workers.current = []; };
  useEffect(() => stopWorkers, []);

  // Heavy per-unit detail (kit, stats, Limit Break, game data) is fetched on demand. Keep the detail loaded for every
  // unit the UI shows as a full card — both teams and Recent units — bumping a version when it arrives so they re-render.
  const [, bumpDetail] = useState(0);
  const detailIds = useMemo(() => {
    const ids = new Set<number>();
    for (const m of [...atk.members, ...def.members, ...recent]) if (m) ids.add(m.boss ? m.boss.baseId : m.unitId);
    for (const t of [atk, def]) if (t.leader) ids.add(t.leader.member.unitId);
    return [...ids];
  }, [atk, def, recent]);
  useEffect(() => {
    let live = true;
    void db.ensure(detailIds).then(() => { if (live) bumpDetail((n) => n + 1); });
    return () => { live = false; };
  }, [db, detailIds]);
  /** The units on both teams, whose detail a simulation needs. */
  const teamUnitIds = () => [
    ...[...atk.members, ...def.members].filter((m): m is MemberConfig => !!m && !m.boss).map((m) => m.unitId),
    ...(mode === "gp" ? [atk.leader, def.leader].filter((l) => !!l).map((l) => l!.member.unitId) : []),
  ];
  /** Assault Rumble: a boss team with its rules and Assault Lv (loaded from the game, a save or a code). */
  const applyBossTeam = (s: BossTeamShare) => {
    setDef({ members: s.bosses.map(bossMember), meta: { title: s.title, authors: s.authors } });
    setAssaultRules(s.rules);
    setAssault((a) => ({
      ...a,
      immortal: s.level >= 10,
      modifiers: a.modifiers.map((m) => (m.id === "level" ? { ...m, label: `Assault Lv ${s.level}${s.level >= 10 ? " (max)" : ""}`, mult: assaultLevelMult(s.level) } : m)),
    }));
  };
  const currentBossTeam = (): BossTeamShare => {
    const lv = assault.modifiers.find((m) => m.id === "level");
    const level = lv ? [10, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((l) => Math.abs(assaultLevelMult(l) - lv.mult) < 1e-9) ?? 10 : 10;
    return { title: def.meta?.title ?? "", authors: def.meta?.authors ?? [], bosses: def.members.filter((m) => m?.boss).map((m) => m!.boss!), rules: assaultRules, level };
  };
  const loadGameBossTeam = (x: { bosses: BossDef[]; rules: GlobalRule[]; level: number; title: string; trustyCoef: number }) => {
    applyBossTeam({ title: x.title, authors: ["Game data"], bosses: x.bosses, rules: x.rules, level: x.level });
    setAssault((a) => ({ ...a, modifiers: a.modifiers.map((m) => (m.id === "owned" ? { ...m, mult: x.trustyCoef, enabled: x.trustyCoef > 1 } : m)) }));
    const notes = x.bosses.reduce((n, b) => n + (b.game?.notes.length ?? 0), 0);
    setNotice(`Loaded ${x.title}: ${x.bosses.length} boss${x.bosses.length === 1 ? "" : "es"}, ${x.rules.length} rules${notes ? `; ${notes} kit part${notes === 1 ? "" : "s"} couldn't be read (see each boss's editor)` : ""}.`);
  };
  /** The rules of this mode's battles: Pirate Rumble's global rules, the boss team's in Assault Rumble, none in GP. */
  const modeRules = mode === "rumble" ? rules : mode === "assault" ? assaultRules : [];
  /** What a battle in this mode needs besides the teams. */
  const modeOpts = (): RunModeOptions => (mode === "gp" ? { mode, gp } : mode === "assault" ? { mode, assault: { zeroTakenPct: assault.zeroTakenPct, immortal: assault.immortal }, scoring: assault } : {});

  const valid = validateTeam(db, atk).length === 0 && validateTeam(db, def).length === 0;
  /** The box in use, for team units with its builds (not while a box video is being read into it). */
  const boxLink: BoxLink | undefined = boxBusy || !box.length ? undefined : {
    units: box, name: boxName, sync: boxSync, onSync: setBoxSync,
    onUpdate: (m) => setBox((b) => b.map((x) => (x.unitId === m.unitId && !x.boss ? m : x))),
  };
  /** Add a GP launch from a click on the burst graph (and rerun the battle). */
  const addLaunch = (side: "atk" | "def", t: number) => {
    const cur = gp[side]?.launch;
    const times = cur?.mode === "times" ? cur.times : [];
    const next = { ...gp, [side]: { ...gp[side], launch: { mode: "times" as const, times: [...times, t].sort((a, b) => a - b) } } };
    setGp(next);
    setNotice(`${side === "atk" ? "Your" : "The opponent's"} burst now launches at ${[...times, t].sort((a, b) => a - b).map((x) => `${x}s`).join(", ")}.`);
  };

  const runOne = async (s = seed) => {
    setError(undefined);
    try {
      // both teams' detail, and the simulator code (its own chunk: the win rate runs it in workers)
      const [{ simulateBattle }] = await Promise.all([import("./sim/battle"), db.ensure(teamUnitIds())]);
      const { scoring: _scoring, ...simMode } = modeOpts();
      void _scoring;
      setSingle(simulateBattle(db, atk, def, { seed: s, frameInterval: 0.1, rules: modeRules, ...simMode }));
      setSingleSeed(s);
    } catch (e) {
      setError(String(e));
    }
  };

  /** A seed from a win rate's lists: into the Seed box, and run it. */
  const pickSeed = (s: number) => { setSeed(s); runOne(s); };

  /**
   * Win rate: the battles are shared out over several workers (one per CPU core, up to 8), each running every n-th
   * battle; the page merges their latest partial results.
   */
  const runMany = async () => {
    setError(undefined);
    setSummary(undefined);
    setHistory([]);
    setStopped(undefined);
    stopWorkers();
    // both teams' detail must be loaded before the workers get their records (the merge comes with the simulator chunk)
    const [{ mergeSummaries }] = await Promise.all([import("./sim/simulate"), db.ensure(teamUnitIds())]);
    const id = ++job.current;
    const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1, Math.ceil(battles / 50)));
    const parts: (WinRateSummary | undefined)[] = new Array(n).fill(undefined);
    const finished = new Array(n).fill(false);
    setProgress({ done: 0, total: battles });
    const update = () => {
      const got = parts.filter((x): x is WinRateSummary => !!x);
      if (!got.length) return;
      const merged = got.reduce((a, b) => mergeSummaries(a, b));
      setSummary(merged);
      setHistory((h) => [...h, { n: merged.battles, p: merged.winRate }]);
      setProgress(finished.every(Boolean) ? undefined : { done: merged.battles, total: battles });
      if (finished.every(Boolean)) stopWorkers();
    };
    const units = [...new Set([...[...atk.members, ...def.members].filter((m): m is MemberConfig => !!m).map((m) => m.unitId), ...teamUnitIds()])]
      .map((uid) => db.byId.get(uid)).filter((u): u is NonNullable<typeof u> => !!u);
    const runMode = modeOpts();
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
      workers.current.push(w);
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        if (m.id !== job.current) return;
        if (m.type === "error") {
          setError(m.message);
          setProgress(undefined);
          stopWorkers();
          return;
        }
        parts[k] = m.summary;
        if (m.type === "done") finished[k] = true;
        update();
      };
      w.postMessage({ id, atk, def, battles, seed, rules: modeRules, vary: "all", start: k, step: n, units, modeOpts: runMode } satisfies WorkerRequest);
    }
  };

  /** Stop early: keep the battles finished so far (the last progress update). */
  const stopMany = () => {
    stopWorkers();
    job.current++;
    if (summary && progress) setStopped({ done: summary.battles, total: progress.total });
    setProgress(undefined);
  };

  return (
    <div className={`layout ${recentOpen ? "recent-open" : ""}`}>
    <RecentPanel
      db={db}
      recent={recent}
      dnd={dnd}
      open={recentOpen}
      maxCc={atk.maxCc}
      presets={presets}
      tab={sideTab}
      onTab={setSideTab}
      teamsContent={savedList(true)}
      teamsCount={savedTeams.length}
      box={box}
      boxName={boxName}
      onEditBox={() => { setView("boxes"); window.scrollTo(0, 0); }}
      {...(boxBusy ? { boxOff: "A box video is being read in My Boxes" } : !box.length ? { boxOff: "No box yet: load one from a box video in My Boxes" } : {})}
      width={panelWidths[panelMode]}
      onResize={(w) => setPanelWidths((p) => ({ ...p, [panelMode]: w < 0 ? PANEL_DEFAULTS[panelMode] : w }))}
      onToggle={() => setRecentOpen(!recentOpen)}
      onChange={setRecent}
    />
    {library && (
      <TeamsDialog
        db={db}
        side={library.side}
        mode={library.mode}
        teams={{ atk, def }}
        saved={savedTeams}
        defaultAuthor={defaultAuthor}
        onMode={(mode) => setLibrary({ ...library, mode })}
        onSave={saveTeam}
        onLoad={loadTeam}
        onDelete={(id) => setSavedTeams((l) => l.filter((e) => e.id !== id))}
        onClose={() => setLibrary(undefined)}
      />
    )}
    <DefaultBuild.Provider value={presets.find((p) => p.label === defaultBuildLabel) ?? presets.find((p) => p.label === "Lv 99")}>
    <main className="app">
      <header className="top">
        <div>
          <h1>OPTC Rumble Sim</h1>
          <p className="muted">
            Build both teams (search for units, or drag them in from Recent units / Saved teams), then run one battle to
            watch it play out, or run a win rate over many battles. Made by SMHmyHead.
          </p>
        </div>
        <div className="mode-bar seg" role="radiogroup" aria-label="Game mode">
          {MODES.map(([m, label, help]) => (
            <button key={m} role="radio" aria-checked={view === "sim" && mode === m} className={view === "sim" && mode === m ? "on" : undefined} title={`${help}. Each mode keeps its own teams.`} onClick={() => setMode(m)}>{label}</button>
          ))}
          <button role="radio" aria-checked={view === "boxes"} className={`boxes-tab ${view === "boxes" ? "on" : ""}`} title="Your boxes of owned units: load one from a box video, change builds" onClick={() => setView("boxes")}>My Boxes</button>
        </div>
        <button className={`settings-btn ${showSettings ? "on" : ""}`} aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>
          ⚙ Settings
        </button>
      </header>

      {showSettings && (
        <section className="card settings">
          <h3>Site settings <span className="muted small">— for every game mode (each mode has its own settings by its teams)</span></h3>
          <p className="muted small">
            Cotton candy maximum per account: {MIN_ACCOUNT_CC} to {MAX_CC} per stat, set by the amount or by that stat's
            monument level (0-35). Only the amounts a monument level gives are possible; others round up to the next one.
            Units set to “Account max” follow it; units with custom amounts keep them.
          </p>
          <div className="settings-row">
            <span className="settings-label">Your account</span>
            <AccountCc value={atk.maxCc} onChange={(cc) => { setAtk({ ...atk, maxCc: cc }); saveJson(ACCOUNT_CC_KEY, cc); }} />
          </div>
          <div className="settings-row">
            <span className="settings-label">Default author</span>
            <input
              className="name-input wide"
              value={defaultAuthor}
              maxLength={AUTHOR_MAX}
              placeholder={AUTHOR_PLACEHOLDER}
              onChange={(e) => setDefaultAuthor(e.target.value)}
              onBlur={() => setDefaultAuthor(cleanAuthor(defaultAuthor))}
              title="Filled in when you save a team that has no author yet."
            />
          </div>
          <div className="settings-row">
            <span className="settings-label">Night mode</span>
            <div className="seg" role="radiogroup" aria-label="Night mode">
              {THEMES.map(([v, label, help]) => (
                <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? "on" : undefined} title={help} onClick={() => setTheme(v)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Unit search</span>
            <label className="check-row" title="A 5★ unit that evolves into a 6★ is left out of the search (searching its ID still finds it)">
              <input type="checkbox" checked={hideFiveStar} onChange={(e) => setHideFiveStar(e.target.checked)} />
              Hide 5★ units that have a 6★ form
            </label>
          </div>
          <div className="settings-row">
            <span className="settings-label">Default build</span>
            <select value={defaultBuildLabel} onChange={(e) => setDefaultBuildLabel(e.target.value)} title="The quick build a unit gets when you add it to a team or a box; also what the screenshot import and the team generator start from">
              {presets.map((p) => <option key={p.label}>{p.label}</option>)}
            </select>
            <span className="muted small">for units you add, and where the import / generator don't know a build</span>
          </div>
          <h4>Quick build presets</h4>
          <PresetEditor presets={presets} potentials={potentialList} onChange={setPresets} onReset={() => setPresets(DEFAULT_PRESETS)} />
        </section>
      )}

      {notice && <div className="notice" role="status">{notice}</div>}
      {view !== "boxes" && boxesHeld && (
        <div className="bg-task" role="status">
          {boxBusy ? <span>My Boxes: {boxBusy.text}</span> : <span>My Boxes: done reading.</span>}
          <button className="small-btn" onClick={() => { setView("boxes"); window.scrollTo(0, 0); }}>{boxBusy ? "Show" : "Review it"}</button>
          {boxBusy && <button className="small-btn" onClick={boxBusy.stop}>Stop</button>}
        </div>
      )}
      {view === "boxes" && genRunning && (
        <div className="bg-task" role="status">
          <span>The team generator is still running.</span>
          <button className="small-btn" onClick={() => { setView("sim"); setTimeout(() => document.querySelector(".generator")?.scrollIntoView({ block: "start" }), 0); }}>Show</button>
        </div>
      )}
      {(view === "boxes" || boxesHeld) && (
        <BoxesPage
          hidden={view !== "boxes"}
          onBusy={setBoxBusy}
          db={db} presets={presets} boxes={boxes} onBoxes={setBoxes} teams={[atk]} recent={recent} maxCc={atk.maxCc}
          importActs={{
            onTeam: (side, t, title) => { loadTeam({ title: `Imported: ${title.replace(/^the /, "")}`, authors: [], team: { ...t, maxCc: (side === "atk" ? atk : def).maxCc, leader: t.leader ?? (side === "atk" ? atk : def).leader } }, side); setView("sim"); },
            onSave: (list) => {
              const now = Date.now();
              const entries: SavedTeam[] = list.map((x, i) => ({ title: x.title, authors: [], team: x.team, id: `${now.toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, savedAt: now }));
              setSavedTeams((l) => [...entries, ...l].slice(0, SAVED_TEAMS_MAX));
            },
            onRecent: (ms) => setRecent((r) => [...ms, ...r].slice(0, RECENT_MAX)),
            onUpdate: (m) => {
              let n = 0;
              const swap = (t: TeamConfig): TeamConfig => ({ ...t, members: t.members.map((x) => (x && !x.boss && x.unitId === m.unitId ? (n++, { ...m }) : x)) });
              const a2 = swap(atk), d2 = swap(def);
              if (n) { setAtk(a2); setDef(d2); }
              return n;
            },
          }}
        />
      )}
      {view !== "boxes" && (<>
      {mode === "assault" && (
        <section className="card mode-card assault-top">
          <h3>Assault Rumble: boss team <span className="muted small">— the game's boss teams come with their own rules</span></h3>
          <GameBossLoader owned={new Set(box.map((m) => m.unitId))} onLoad={loadGameBossTeam} />
          <div className="row-btns">
            <button onClick={() => setBossLibrary(true)} title="Save this boss team (with its rules and Assault Lv) or load a saved one / a code">Save / load boss teams…</button>
          </div>
          <details className="mini">
            <summary>Rules for this boss team ({assaultRules.length})</summary>
            <RulesEditor db={db} rules={assaultRules} onChange={setAssaultRules} />
          </details>
          <details className="mini">
            <summary>Score settings</summary>
            <AssaultSettingsEditor settings={assault} onChange={setAssault} />
          </details>
        </section>
      )}
      {bossLibrary && (
        <BossTeamsDialog
          db={db}
          current={currentBossTeam()}
          saved={savedBossTeams}
          defaultAuthor={defaultAuthor}
          onClose={() => setBossLibrary(false)}
          onSave={(s) => setSavedBossTeams((l) => [{ ...s, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: Date.now() }, ...l].slice(0, SAVED_TEAMS_MAX))}
          onDelete={(id) => setSavedBossTeams((l) => l.filter((x) => x.id !== id))}
          onLoad={(s) => { applyBossTeam(s); setBossLibrary(false); setNotice(`Loaded the boss team “${s.title || "Untitled"}” (Assault Lv ${s.level}, ${s.rules.length} rules).`); }}
        />
      )}
      {mode === "rumble" && (
        <ModeCard id="rumble" title="Pirate Rumble settings" sub="opponent account, global rules">
          <div className="settings-row">
            <span className="settings-label">Opponent account</span>
            <AccountCc value={def.maxCc} onChange={(cc) => setDef({ ...def, maxCc: cc })} />
          </div>
          <h4>Global rules</h4>
          <RuleSets rules={rules} follow={rulesFollow} onFollow={setRulesFollow} onRules={(r, what) => { setRules(r); setNotice(`Rules: ${what}.`); }} />
          <RulesEditor db={db} rules={rules} onChange={(r) => { setRules(r); setRulesFollow(false); }} />
        </ModeCard>
      )}
      {mode === "gp" && (
        <ModeCard id="gp" title="Grand Party settings" sub="opponent account, burst start charge / uses / launches, season boost">
          <div className="settings-row">
            <span className="settings-label">Opponent account</span>
            <AccountCc value={def.maxCc} onChange={(cc) => setDef({ ...def, maxCc: cc })} />
          </div>
          <GpSettings db={db} teams={{ atk, def }} gp={gp} onChange={setGp} />
        </ModeCard>
      )}
      <SearchOptions.Provider value={searchOptions}>
      <div className="teams">
        <TeamEditor
          title={mode === "assault" ? "Bosses (Assault Rumble)" : "Opponent (defending)"} side="def" db={db} team={def} dnd={dnd} presets={presets} onChange={setDef} onRetire={retire} box={boxLink}
          onLibrary={(m) => (mode === "assault" ? setBossLibrary(true) : setLibrary({ side: "def", mode: m }))} open={openTeams.def} onOpen={(v) => setOpenTeams((o) => ({ ...o, def: v }))}
          bosses={mode === "assault" ? {
            onAdd: (index) => setBossEdit({ index, isNew: true, boss: newBossDraft() }),
            onEdit: (index) => { const b = def.members[index]?.boss; if (b) setBossEdit({ index, isNew: false, boss: b }); },
          } : undefined}
          extra={mode === "gp" ? <LeaderSlot db={db} team={def} side="def" boost={gp.boost} onChange={(leader) => setDef({ ...def, leader })} /> : undefined}
        />
        <TeamEditor
          title="Your team (attacking)" side="atk" db={db} team={atk} dnd={dnd} presets={presets} onChange={setAtk} onRetire={retire} box={boxLink}
          onLibrary={(m) => setLibrary({ side: "atk", mode: m })} open={openTeams.atk} onOpen={(v) => setOpenTeams((o) => ({ ...o, atk: v }))}
          extra={mode === "gp" ? <LeaderSlot db={db} team={atk} side="atk" boost={gp.boost} onChange={(leader) => setAtk({ ...atk, leader })} /> : undefined}
        />
      </div>
      </SearchOptions.Provider>
      <div className="team-actions">
        {mode !== "assault" && <button className="link" onClick={() => { setAtk(def); setDef(atk); }} title="Swap the two teams (each keeps its account's cotton candy max)">Swap sides</button>}
        <button className="link" onClick={() => setImporting(true)} title={`Read teams, the opponent${FEATURES.grandParty ? ", GP teams" : ""} or your whole box from screenshots or a screen recording`}>📷 Import from screenshots</button>
      </div>
      {importing && (<Suspense fallback={null}>
        <ImportDialog
          db={db}
          presets={presets}
          maxCc={atk.maxCc}
          onClose={() => setImporting(false)}
          onTeam={(side, t, title) => loadTeam({ title: `Imported: ${title.replace(/^the /, "")}`, authors: [], team: { ...t, maxCc: (side === "atk" ? atk : def).maxCc, leader: t.leader ?? (side === "atk" ? atk : def).leader } }, side)}
          onSave={(list) => {
            const now = Date.now();
            const entries: SavedTeam[] = list.map((x, i) => ({ title: x.title, authors: [], team: x.team, id: `${now.toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, savedAt: now }));
            setSavedTeams((l) => [...entries, ...l].slice(0, SAVED_TEAMS_MAX));
          }}
          // the box keeps one entry per unit: an imported one replaces it (it carries what was read)
          onBox={(ms) => setBox((b) => mergeIntoBox(b, ms))}
          onRecent={(ms) => setRecent((r) => [...ms, ...r].slice(0, RECENT_MAX))}
          onUpdate={(m) => {
            let n = 0;
            const swap = (t: TeamConfig): TeamConfig => ({ ...t, members: t.members.map((x) => (x && !x.boss && x.unitId === m.unitId ? (n++, { ...m }) : x)) });
            const a2 = swap(atk), d2 = swap(def);
            if (n) { setAtk(a2); setDef(d2); }
            return n;
          }}
        />
      </Suspense>)}
      {bossEdit && (
        <BossEditor
          db={db}
          boss={bossEdit.boss}
          isNew={bossEdit.isNew}
          onCancel={() => setBossEdit(undefined)}
          onSave={(b) => {
            setDef((cur) => ({ ...cur, members: cur.members.map((x, i) => (i === bossEdit.index ? bossMember(b) : x)) }));
            setBossEdit(undefined);
          }}
        />
      )}

      <section className="controls run-bar">
        <div className="run-group" aria-label="One battle">
          <span className="run-title">One battle</span>
          <label title="Every seed is one particular battle: the same seed and teams always play out the same">
            Seed
            <input type="number" value={seed} min={1} onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button className="primary" disabled={!valid} onClick={() => runOne()}>▶ Run battle</button>
          <button disabled={!valid} onClick={() => { setSeed(seed + 1); runOne(seed + 1); }} title="Go to the next seed and run it">Next seed ▸</button>
          <button
            disabled={!valid}
            onClick={() => { const s = 1 + Math.floor(Math.random() * 999_999); setSeed(s); runOne(s); }}
            title="Pick a random seed and run it"
          >
            🎲 Random seed
          </button>
        </div>
        <div className="run-group" aria-label="Win rate">
          <span className="run-title">{mode === "assault" ? "Many battles" : "Win rate"}</span>
          <label>
            Battles
            <input type="number" value={battles} min={10} step={100} onChange={(e) => setBattles(Math.max(10, Number(e.target.value) || 10))} />
          </label>
          {progress ? (
            <button className="danger-btn" onClick={stopMany} title="Stop now and keep the result of the battles run so far">Stop</button>
          ) : (
            <button className="primary" disabled={!valid} onClick={runMany}>▶ {mode === "assault" ? "Run scores" : "Run win rate"}</button>
          )}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      </>)}

      {/* the team generator stays on out of sight on My Boxes: going there doesn't stop it or lose what it found */}
      <div hidden={view === "boxes"}>
      <Suspense fallback={<p className="muted">Loading the team generator…</p>}>
      <GeneratorPanel
        mode={mode} onRunning={setGenRunning}
        db={db} atk={atk} def={def} rules={modeRules} modeOpts={modeOpts()} assault={mode === "assault"} seed={seed}
        presets={presets} saved={savedTeams} recent={recent} box={box} boxName={boxName} onEditBox={() => { setView("boxes"); window.scrollTo(0, 0); }}
        onUse={(t, title) => loadTeam({ title, authors: ["Team generator"], team: { ...t, maxCc: atk.maxCc, leader: atk.leader } }, "atk")}
        onSave={(t, title) => {
          const entry: SavedTeam = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title, authors: ["Team generator"], team: teamOnly({ ...t, maxCc: atk.maxCc }), savedAt: Date.now() };
          setSavedTeams((l) => [entry, ...l].slice(0, SAVED_TEAMS_MAX));
          setNotice(`Saved “${title}” to Saved teams.`);
        }}
      />
      </Suspense>
      </div>

      {view !== "boxes" && (<>

      {(summary || progress) && (
        <section className="card">
          <h3>
            {mode === "assault" ? "Score" : "Win rate"}{" "}
            {progress && <span className="muted">(running: {progress.done.toLocaleString()}/{progress.total.toLocaleString()})</span>}
            {stopped && <span className="muted">(stopped at {stopped.done.toLocaleString()}/{stopped.total.toLocaleString()})</span>}
          </h3>
          {summary?.score && <ScoreSummary score={summary.score} onPick={pickSeed} />}
          {summary && !summary.score && (
            <>
              <WinBar summary={summary} history={history} total={progress?.total ?? stopped?.total ?? summary.battles} running={!!progress} />
              <div className="stats">
                <Stat label="Attacker win rate" value={`${(summary.winRate * 100).toFixed(1)}%`} sub={`± ${(summary.margin * 100).toFixed(1)}% (95%), SE ${(summary.se * 100).toFixed(2)}%`} />
                <Stat label="Battles" value={summary.battles.toLocaleString()} sub={`${(summary.ms / Math.max(1, summary.battles)).toFixed(1)} ms each`} />
                <Stat label="Avg end time" value={`${summary.avgTime.toFixed(1)}s`} />
                <Stat label="Time-outs" value={`${((summary.timeouts / summary.battles) * 100).toFixed(1)}%`} />
                <Stat label="Avg units left" value={`${summary.avgAttackersLeft.toFixed(2)} / ${summary.avgDefendersLeft.toFixed(2)}`} sub="attackers / defenders" />
                <div className="seed-lists">
                <SeedList label="Win seeds" kind="win" seeds={summary.seedLists.win} total={summary.attackerWins} onPick={pickSeed} />
                <SeedList label="Loss seeds" kind="loss" seeds={summary.seedLists.loss} total={summary.battles - summary.attackerWins - summary.timeouts} onPick={pickSeed} help="lost before the time ran out" />
                <SeedList label="Time-out seeds" kind="timeout" seeds={summary.seedLists.timeout} total={summary.timeouts} onPick={pickSeed} help="lost on time (the attackers never win on time)" />
                </div>
              </div>
              <Unsupported data={summary.unsupported} />
            </>
          )}
        </section>
      )}

      {single && (
        <section className="card">
          <h3>
            Battle (seed {singleSeed}): {single.assault ? (single.reason === "wipe" ? "your team was wiped out" : "the time ran out") : <>{single.winner === "atk" ? "Attackers" : "Defenders"} win</>}
            {" "}<span className="muted">({single.reason === "wipe" ? "a team has no units left on the field or bench" : "time out"} at {single.time.toFixed(1)}s, {single.decisions.length} random draws)</span>
          </h3>
          {single.assault && <BattleScore result={single} settings={assault} />}
          {single.gp && <BurstGraph result={single} gp={gp} onAddLaunch={(side, t) => { addLaunch(side, t); }} />}
          <Suspense fallback={<p className="muted">Loading replay…</p>}><Replay result={single} db={db} /></Suspense>
          <details className="sub-section battle-stats">
            <summary>Battle stats: damage, healing, specials, KOs</summary>
            <UnitTable result={single} />
            <Unsupported data={single.unsupported} />
          </details>
        </section>
      )}
      </>)}

      <footer className="site-foot muted small">
        <p>{dataAsOf()}</p>
        <p>
          OPTC Rumble Sim is a fan-made tool, not affiliated with or endorsed by Bandai Namco Entertainment. ONE PIECE ©
          Eiichiro Oda / Shueisha, Toei Animation; game art from ONE PIECE Treasure Cruise © Bandai Namco Entertainment.
        </p>
        <p>
          Unit data from <a href="https://2shankz.github.io/optc-db.github.io/" target="_blank" rel="noreferrer">OPTC-DB</a> (GPL-3.0).
          Default teams from Nydato's Rumble sheet. Your teams, boxes and settings stay in this browser: screenshots and
          videos are read on your own device and never uploaded.
          {" "}<a href="https://github.com/jack-berry4/OPTC-Rumble-Sim/issues" target="_blank" rel="noreferrer">Report a bug or a wrong mechanic</a>.
        </p>
      </footer>
    </main>
    </DefaultBuild.Provider>
    </div>
  );
}

/** A game mode's settings card above its teams, folded until opened (remembered per mode in this browser). */
function ModeCard(props: { id: string; title: string; sub: string; children: React.ReactNode }) {
  // folded by default (user, 2026-11-22); "-2": earlier open states start over
  const [open, setOpen] = usePersistedFlag(`rumble-sim-mode-card-${props.id}-open-2`, false);
  return (
    <details className="card mode-card fold" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><h3>{props.title}</h3>{!open && <span className="muted small"> — {props.sub}</span>}</summary>
      {props.children}
    </details>
  );
}

/** Live win rate: attackers (left) vs defenders (right), the 95% band, and the rate's trace over the battles run. */
function WinBar({ summary, history, total, running }: { summary: WinRateSummary; history: { n: number; p: number }[]; total: number; running: boolean }) {
  const p = summary.winRate * 100;
  const lo = Math.max(0, p - summary.margin * 100);
  const hi = Math.min(100, p + summary.margin * 100);
  // time-outs: losses (the defenders win on time), drawn hatched at the defenders' end [user 2026-11-18]
  const to = summary.battles ? (summary.timeouts / summary.battles) * 100 : 0;
  const W = 600, H = 60;
  const pts = history.map((h) => `${((h.n / total) * W).toFixed(1)},${(H - h.p * H).toFixed(1)}`).join(" ");
  return (
    <div className={`winbar-wrap ${running ? "running" : ""}`}>
      <div className="winbar-labels">
        <span className="atk-text">Attackers {p.toFixed(1)}%</span>
        <span className="def-text">
          {to > 0 && <span className="winbar-to-label" title="Battles that ran out of time: losses for the attackers">{to.toFixed(1)}% time-outs · </span>}
          {(100 - p).toFixed(1)}% Defenders
        </span>
      </div>
      <div className="winbar" title={`Attacker win rate ${p.toFixed(1)}% (95%: ${lo.toFixed(1)}-${hi.toFixed(1)}%) after ${summary.battles.toLocaleString()} battles; defenders ${(100 - p - to).toFixed(1)}% by KO, ${to.toFixed(1)}% on time (hatched)`}>
        <div className="winbar-atk" style={{ width: `${p}%` }} />
        {to > 0 && <div className="winbar-timeout" style={{ width: `${to}%` }} />}
        <div className="winbar-band" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <div className="winbar-mid" />
        <div className="winbar-mark" style={{ left: `${p}%` }} />
      </div>
      {history.length > 1 && (
        <svg className="wintrace" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Attacker win rate over the battles run">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="wintrace-mid" />
          <polyline points={pts} className="wintrace-line" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {history.length > 1 && (
        <div className="winbar-axis muted"><span>0</span><span>Attacker win rate by battles run (middle line = 50%)</span><span>{total.toLocaleString()}</span></div>
      )}
    </div>
  );
}

/**
 * One of the win rate's seed lists (wins / losses / time-outs): a small scrolling box of seeds; click one to run that
 * battle, Copy puts them all on the clipboard ("1, 5, 12"). Each is a seed for the One battle box.
 */
function SeedList(props: { label: string; kind: "win" | "loss" | "timeout"; seeds: number[]; total: number; onPick: (s: number) => void; help?: string }) {
  const [copied, setCopied] = useState(false);
  const capped = props.seeds.length < props.total;
  const copy = () => {
    navigator.clipboard?.writeText(props.seeds.join(", ")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }, () => {});
  };
  return (
    <div className={`stat seed-box seed-${props.kind}`} title={`Seeds of the battles ${props.help ?? "won"}${capped ? ` (the lowest ${props.seeds.length.toLocaleString()} of ${props.total.toLocaleString()})` : ""}. Click one to run it as One battle.`}>
      <div className="stat-label seed-head">
        <span>{props.label} <span className="seed-count">{props.total.toLocaleString()}</span></span>
        <button className="small-btn" disabled={!props.seeds.length} onClick={copy} title="Copy these seeds (comma-separated)">{copied ? "Copied" : "Copy"}</button>
      </div>
      <div className="seed-scroll">
        {props.seeds.length ? props.seeds.map((s) => <button key={s} className="seed-chip" onClick={() => props.onPick(s)}>{s}</button>) : <span className="muted">none</span>}
        {capped && <span className="muted"> …</span>}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{props.label}</div>
      <div className="stat-value">{props.value}</div>
      {props.sub && <div className="stat-sub">{props.sub}</div>}
    </div>
  );
}

function UnitTable({ result }: { result: SimResult }) {
  return (
    <div className="table-wrap">
      <table className="units">
        <thead>
          <tr>
            <th>Unit</th><th className="num">HP left</th><th className="num">Damage dealt</th><th className="num">Taken</th>
            <th className="num">Healed</th><th className="num">Actions</th><th className="num">Specials</th><th className="num">KOs</th>
          </tr>
        </thead>
        <tbody>
          {result.units.map((u) => (
            <tr key={u.uid} className={`row-${u.side} ${u.alive ? "" : "dead"}`}>
              <td>{u.side === "atk" ? "A" : "D"}{u.slot} {u.name}</td>
              <td className="num">{u.hp.toLocaleString()} / {u.maxHp.toLocaleString()}</td>
              <td className="num">{u.damageDealt.toLocaleString()}</td>
              <td className="num">{u.damageTaken.toLocaleString()}</td>
              <td className="num">{u.healingDone.toLocaleString()}</td>
              <td className="num">{u.actions}</td>
              <td className="num">{u.specials}</td>
              <td className="num">{u.kos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Data as of: units (OPTC-DB) Nov 23, 2026 · game data Nov 19 · ..." from the build (vite.config.ts). */
function dataAsOf(): string {
  const day = (d?: string) => d && new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const d = __DATA_DATES__;
  const parts = [
    d.units && `units (OPTC-DB) ${day(d.units)}`,
    d.game && `game data ${day(d.game)}`,
    d.sheet && `Nydato's sheet ${day(d.sheet)}`,
    d.meta && `meta run ${day(d.meta)}`,
  ].filter(Boolean);
  return parts.length ? `Data as of: ${parts.join(" · ")}.` : "";
}

function Unsupported({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <details className="unsupported">
      <summary>{entries.length} effect kinds not simulated yet (skipped)</summary>
      <ul>{entries.map(([k, v]) => <li key={k}><code>{k}</code> ×{v}</li>)}</ul>
    </details>
  );
}
