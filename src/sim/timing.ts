import type { Dice } from "./rand";

/**
 * Animation times and distances (handoff section 9), drawn once per unit per battle from the timing stream:
 * accurate units use their values, rough ones draw inside their measured range, unmeasured units borrow a random
 * measured unit's profile. Times are seconds from ARRIVING at the attack tile; reach is the distance kept from the
 * target (px). No unit crouches before setting off (user 2026-11-17: Kizaru's measured 0.35 s was a tracking error).
 *
 * The wind-up (arrive -> damage number) of a unit whose attack animation was decoded (data/units.json
 * `game.attack`, tools/ssd) comes from its first hit frame instead: decodedWindup [M data]. Stay and reach still come
 * from the measured or borrowed profile (the files don't give the stay).
 */
export interface Timing { windup: number; stay: number; reach: number }

/** Where a unit's timings came from (shown in the run's `timings`). */
export interface TimingInfo {
  /** The measured profile used for stay / reach (and wind-up when there is no decoded attack). */
  profile: string;
  /** The profile is the unit's own measurement (not borrowed). */
  measured: boolean;
  /** "data" = decoded from the attack .ssd (first hit frame), "measured" = own profile, "borrowed" = another unit's profile. */
  windupFrom: "data" | "measured" | "borrowed";
  /** Same for the stay: "data" = the attack animation's length. */
  stayFrom: "data" | "measured" | "borrowed";
  /** The decoded first hit frame and animation length (frames), when taken from the data. */
  firstHit?: number;
  frames?: number;
}

type Range = number | [number, number];
interface Profile { name: string; ids: number[]; windup: Range; stay: Range; reach?: Range; accurate?: boolean }

export const PROFILES: Profile[] = [
  { name: "Pacifista", ids: [968, 969, 970, 971, 972], windup: 0.87, stay: 2.33, reach: 212, accurate: true },
  { name: "Luffy 2087", ids: [2087], windup: 0.89, stay: 2.33, reach: 110, accurate: true },
  { name: "King 3137", ids: [3137], windup: [0.84, 0.92], stay: [2.33, 2.43], reach: 110 },
  { name: "Nico Robin 4375", ids: [4375], windup: [0.81, 0.85], stay: 2.33, reach: 150 },
  { name: "Usohachi", ids: [2805, 2806], windup: 0.81, stay: 2.33 },
  // no crouch: the measured 0.35 s crouch was a tracking error (user 2026-11-17: he stood just behind the bottom of the
  // NEXT column, which hid him; he sets off 1-2 frames after leaving it like every unit). His wind-up is the decoded
  // 0.57 s (the measured 0.70 included part of the error); used when his profile is borrowed.
  { name: "Kizaru 3704", ids: [3704], windup: 0.57, stay: 2.15 },
  { name: "Cabaji", ids: [37], windup: [0.51, 0.63], stay: [3.03, 3.23], reach: 110 },
  { name: "Buggy crew", ids: [39, 30, 36], windup: [0.45, 0.59], stay: [2.6, 3.2], reach: 212 },
  { name: "Shooter crews", ids: [158, 159, 160, 161], windup: [0.43, 0.5], stay: [2.9, 3.1], reach: [212, 280] },
];

const BY_ID = new Map<number, Profile>();
for (const p of PROFILES) for (const id of p.ids) BY_ID.set(id, p);
const WITH_REACH = PROFILES.filter((p) => p.reach !== undefined);

/**
 * A Full attack adds this much time BEFORE the attack, while the game shows its "Full Attack" graphic: the unit waits,
 * then sets off; its wind-up and stay are a Normal attack's [C user 2026-11-17: the shape]. 0.75 s [M few samples,
 * measured from the label to the number].
 */
export const FULL_EXTRA = 0.75;

/**
 * The attack animation plays at 40 frames per second from the moment the attacker arrives (its HP bar stops; the strip
 * starts fading in), whatever fps the file says [M user labels 2026-11-17: 7 units of all three templates, run 9/10,
 * first hit / 40 within 0.02 s; unit leaves when the animation ends: strip gone ~0.17 s later after its fade; earlier
 * measured stays 2.30-2.41 s for 92-frame units = 92 / 40]. (The first, 60 fps + 0.12 s model was fitted to the strip
 * being fully visible, which hid the difference between templates.)
 */
export const ATTACK_FPS = 40;

/** Arrive -> first hit (the damage number) from the attack animation's first hit frame [M data]. */
export const decodedWindup = (firstHit: number) => firstHit / ATTACK_FPS;
/** Arrive -> leave: the attack animation's length [M data]. */
export const decodedStay = (frames: number) => frames / ATTACK_FPS;

const pick = (r: Range, u: number) => (typeof r === "number" ? r : r[0] + (r[1] - r[0]) * u);

/** `firstHit` / `frames`: the unit's decoded attack (UnitRecord.game.attack), if any. */
export function timingFor(unitId: number, dice: Dice, key: number, firstHit?: number, frames?: number): Timing & TimingInfo {
  const u = (k: string) => dice.u("timing", key, k);
  let p = BY_ID.get(Math.floor(unitId));
  const measured = !!p;
  if (!p) p = PROFILES[Math.floor(u("profile") * PROFILES.length)]!;
  const fixed = p.accurate;
  const reachSrc = p.reach ?? WITH_REACH[Math.floor(u("reachProfile") * WITH_REACH.length)]!.reach!;
  const data = firstHit !== undefined;
  const dataStay = data && frames !== undefined && frames > 0;
  const own = measured ? "measured" : "borrowed";
  return {
    profile: p.name,
    measured,
    windupFrom: data ? "data" : own,
    stayFrom: dataStay ? "data" : own,
    ...(data ? { firstHit } : {}),
    ...(dataStay ? { frames } : {}),
    windup: data ? decodedWindup(firstHit) : fixed ? pick(p.windup, 0.5) : pick(p.windup, u("windup")),
    stay: dataStay ? decodedStay(frames) : fixed ? pick(p.stay, 0.5) : pick(p.stay, u("stay")),
    reach: fixed ? pick(reachSrc, 0.5) : pick(reachSrc, u("reach")),
  };
}
