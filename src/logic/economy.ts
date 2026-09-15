/**
 * The forge's economy: tap value, idle output, upgrade costs, offline earnings and prestige.
 *
 * Pure and dependency-free, with elapsed time always passed in rather than read from the
 * clock here. That is what makes "it runs while you sleep" testable without waiting.
 *
 * Every one of the paywall's claims except "no ads" is a number in this file, and each takes
 * `isPremium` explicitly so the gate is visible at the call site rather than buried.
 */

export type UpgradeKind = "tap" | "idle";

export interface Upgrade {
  id: string;
  nameKey: string;
  kind: UpgradeKind;
  baseCost: number;
  /** Cost multiplier per level. */
  growth: number;
  /** What one level adds — to the tap, or to output per second. */
  gain: number;
}

/** Levels bought, by upgrade id. Absent means zero. */
export type Levels = Record<string, number>;

/** What the purchase multiplies both tap value and idle output by, forever. */
export const PREMIUM_MULTIPLIER = 2;
/** Hours of offline progress each tier banks. */
export const FREE_OFFLINE_HOURS = 8;
export const PREMIUM_OFFLINE_HOURS = 24;

/** Lifetime output before prestige is worth anything at all. */
const PRESTIGE_THRESHOLD = 1e6;

export const UPGRADES: Upgrade[] = [
  {
    id: "hammer",
    nameKey: "upgradeHammer",
    kind: "tap",
    baseCost: 10,
    growth: 1.15,
    gain: 1,
  },
  {
    id: "anvil",
    nameKey: "upgradeAnvil",
    kind: "tap",
    baseCost: 250,
    growth: 1.18,
    gain: 8,
  },
  {
    id: "apprentice",
    nameKey: "upgradeApprentice",
    kind: "idle",
    baseCost: 50,
    growth: 1.16,
    gain: 1,
  },
  {
    id: "bellows",
    nameKey: "upgradeBellows",
    kind: "idle",
    baseCost: 1_200,
    growth: 1.2,
    gain: 12,
  },
  {
    id: "furnace",
    nameKey: "upgradeFurnace",
    kind: "idle",
    baseCost: 30_000,
    growth: 1.22,
    gain: 140,
  },
];

const byId = new Map(UPGRADES.map((u) => [u.id, u]));

/** Cost of the *next* level when `level` are already owned. */
export function costOf(id: string, level: number): number {
  const upgrade = byId.get(id);
  // An unknown id costs nothing rather than producing NaN, which would poison every
  // comparison downstream and make a balance display read "NaN".
  if (!upgrade) return 0;
  return upgrade.baseCost * upgrade.growth ** Math.max(0, level);
}

/**
 * Cost of buying `count` levels starting from `level`.
 *
 * The sum of a geometric series, not `costOf(level) * count`. That mistake undercharges
 * enormously on a growth curve — a player buys a hundred levels for roughly the price of
 * three — and it is invisible until someone does it.
 */
export function bulkCost(id: string, level: number, count: number): number {
  const upgrade = byId.get(id);
  if (!upgrade || count <= 0) return 0;
  const first = costOf(id, level);
  const r = upgrade.growth;
  if (r === 1) return first * count;
  return (first * (r ** count - 1)) / (r - 1);
}

const levelsOf = (levels: Levels, id: string): number =>
  Math.max(0, levels[id] ?? 0);

/** Output from one tap. Always at least one, so a fresh game is playable. */
export function tapValue(
  levels: Levels,
  prestige: number,
  isPremium: boolean,
): number {
  const base = UPGRADES.filter((u) => u.kind === "tap").reduce(
    (sum, u) => sum + u.gain * levelsOf(levels, u.id),
    1,
  );
  return base * prestige * (isPremium ? PREMIUM_MULTIPLIER : 1);
}

/** Output per second with nobody touching the screen. Zero until something is bought. */
export function outputPerSecond(
  levels: Levels,
  prestige: number,
  isPremium: boolean,
): number {
  const base = UPGRADES.filter((u) => u.kind === "idle").reduce(
    (sum, u) => sum + u.gain * levelsOf(levels, u.id),
    0,
  );
  return base * prestige * (isPremium ? PREMIUM_MULTIPLIER : 1);
}

/**
 * What accumulated while the app was closed.
 *
 * `elapsedMs` is a measured gap, not a counter, so it is correct across a force-quit, a
 * reboot, or a week away. A negative gap — a device clock moved backwards — pays nothing
 * rather than minting currency.
 */
export function offlineEarnings(
  levels: Levels,
  prestige: number,
  isPremium: boolean,
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const capHours = isPremium ? PREMIUM_OFFLINE_HOURS : FREE_OFFLINE_HOURS;
  const seconds = Math.min(elapsedMs, capHours * 3600_000) / 1000;
  return outputPerSecond(levels, prestige, isPremium) * seconds;
}

/**
 * Prestige points for a given lifetime output.
 *
 * A cube root, so each order of magnitude is worth progressively less — the standard shape,
 * and the one that keeps a long game from becoming a single button press.
 */
export function prestigeGain(lifetimeOutput: number): number {
  if (!Number.isFinite(lifetimeOutput) || lifetimeOutput < PRESTIGE_THRESHOLD)
    return 0;
  return Math.floor((lifetimeOutput / PRESTIGE_THRESHOLD) ** (1 / 3));
}

/** Points to a multiplier. Ten per cent each, so the first point is felt immediately. */
export function prestigeMultiplier(points: number): number {
  return 1 + Math.max(0, points) * 0.1;
}

const SUFFIXES = [
  "",
  "K",
  "M",
  "B",
  "T",
  "Qa",
  "Qi",
  "Sx",
  "Sp",
  "Oc",
  "No",
  "Dc",
];

/**
 * A readable number.
 *
 * An idle game's whole surface is numbers that get very large, and `1.7823e12` is not a
 * quantity a player can feel. Past the suffix list it falls back to exponential rather than
 * printing `undefined`, which is what an unchecked lookup would do.
 */
export function format(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1000) return String(Math.floor(value));

  const tier = Math.floor(Math.log10(value) / 3);
  const suffix = SUFFIXES[tier];
  if (suffix === undefined) return value.toExponential(2);
  return `${(value / 1000 ** tier).toFixed(2)}${suffix}`;
}
