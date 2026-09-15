/**
 * The forge: balance, upgrade levels, prestige, and what accrued while the app was closed.
 *
 * Three of the paywall's four claims are numbers in `src/logic/economy.ts` and are passed
 * `isPremium` from here; the fourth (themes) is gated in `setTheme`. The store only
 * sequences the economy and persists it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import {
  type Levels,
  UPGRADES,
  costOf,
  offlineEarnings,
  outputPerSecond,
  prestigeGain,
  prestigeMultiplier,
  tapValue,
} from "@/logic/economy";
import { FORGE_THEMES } from "@/theme/forge";

export const FORGE_CACHE_KEY = "tapforge.state.v1";

interface ForgeState {
  balance: number;
  /** Everything ever earned, which is what prestige is calculated from. */
  lifetime: number;
  levels: Levels;
  prestigePoints: number;
  theme: string;
  /** Absolute time of the last save. Offline earnings are measured against this. */
  lastSeenAt: number | null;

  tap: (isPremium: boolean) => number;
  tick: (seconds: number, isPremium: boolean) => void;
  buy: (
    id: string,
    isPremium: boolean,
  ) => "bought" | "too-expensive" | "unknown";
  canAfford: (id: string) => boolean;
  doPrestige: () => "done" | "not-yet";
  pendingPrestige: () => number;
  multiplier: () => number;
  perSecond: (isPremium: boolean) => number;
  setTheme: (name: string, isPremium: boolean) => void;
  /** Applies what accrued while away and returns it, so the screen can report it. */
  collectOffline: (isPremium: boolean, now?: number) => number;
  persist: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const known = new Set(UPGRADES.map((u) => u.id));

function validLevels(value: unknown): Levels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Levels = {};
  for (const [id, level] of Object.entries(value as Record<string, unknown>)) {
    // An unknown id would show as an upgrade nobody can see and would never be spent.
    if (!known.has(id)) continue;
    if (typeof level !== "number" || !Number.isFinite(level) || level < 0)
      continue;
    out[id] = Math.floor(level);
  }
  return out;
}

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export const useForgeStore = create<ForgeState>((set, get) => ({
  balance: 0,
  lifetime: 0,
  levels: {},
  prestigePoints: 0,
  theme: "default",
  lastSeenAt: null,

  tap(isPremium) {
    const { levels, prestigePoints } = get();
    const gained = tapValue(
      levels,
      prestigeMultiplier(prestigePoints),
      isPremium,
    );
    set((s) => ({
      balance: s.balance + gained,
      lifetime: s.lifetime + gained,
    }));
    return gained;
  },

  tick(seconds, isPremium) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const { levels, prestigePoints } = get();
    const gained =
      outputPerSecond(levels, prestigeMultiplier(prestigePoints), isPremium) *
      seconds;
    if (gained <= 0) return;
    set((s) => ({
      balance: s.balance + gained,
      lifetime: s.lifetime + gained,
    }));
  },

  buy(id, isPremium) {
    if (!known.has(id)) return "unknown";
    const { balance, levels } = get();
    const cost = costOf(id, levels[id] ?? 0);
    if (balance < cost) return "too-expensive";
    set((s) => ({
      balance: s.balance - cost,
      levels: { ...s.levels, [id]: (s.levels[id] ?? 0) + 1 },
    }));
    void get().persist();
    // isPremium is not consulted here on purpose: the purchase multiplies output, it does not
    // discount upgrades. Taking it would make the price depend on who is asking.
    void isPremium;
    return "bought";
  },

  canAfford(id) {
    const { balance, levels } = get();
    return known.has(id) && balance >= costOf(id, levels[id] ?? 0);
  },

  pendingPrestige() {
    return prestigeGain(get().lifetime);
  },

  doPrestige() {
    const gain = get().pendingPrestige();
    if (gain <= 0) return "not-yet";
    // Lifetime resets too. Leaving it would let a player prestige repeatedly off the same
    // earnings, which turns a long-run mechanic into a button that prints multipliers.
    set((s) => ({
      prestigePoints: s.prestigePoints + gain,
      balance: 0,
      lifetime: 0,
      levels: {},
    }));
    void get().persist();
    return "done";
  },

  multiplier() {
    return prestigeMultiplier(get().prestigePoints);
  },

  perSecond(isPremium) {
    const { levels, prestigePoints } = get();
    return outputPerSecond(
      levels,
      prestigeMultiplier(prestigePoints),
      isPremium,
    );
  },

  setTheme(name, isPremium) {
    if (!(name in FORGE_THEMES)) return;
    if (!isPremium && name !== "default") return;
    set({ theme: name });
    void get().persist();
  },

  collectOffline(isPremium, now = Date.now()) {
    const { lastSeenAt, levels, prestigePoints } = get();
    if (lastSeenAt === null) {
      set({ lastSeenAt: now });
      return 0;
    }
    const gained = offlineEarnings(
      levels,
      prestigeMultiplier(prestigePoints),
      isPremium,
      now - lastSeenAt,
    );
    set((s) => ({
      balance: s.balance + gained,
      lifetime: s.lifetime + gained,
      lastSeenAt: now,
    }));
    void get().persist();
    return gained;
  },

  async persist() {
    const { balance, lifetime, levels, prestigePoints, theme } = get();
    try {
      // lastSeenAt is written as *now*, not as the stored value: this is the moment the app
      // was last known to be alive, and it is what the next launch measures against.
      await AsyncStorage.setItem(
        FORGE_CACHE_KEY,
        JSON.stringify({
          balance,
          lifetime,
          levels,
          prestigePoints,
          theme,
          lastSeenAt: Date.now(),
        }),
      );
    } catch {
      // A lost save costs progress, never the launch.
    }
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(FORGE_CACHE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const record = parsed as Record<string, unknown>;
      set({
        balance: num(record.balance),
        lifetime: num(record.lifetime),
        levels: validLevels(record.levels),
        prestigePoints: Math.floor(num(record.prestigePoints)),
        theme:
          typeof record.theme === "string" && record.theme in FORGE_THEMES
            ? record.theme
            : "default",
        lastSeenAt:
          typeof record.lastSeenAt === "number" ? record.lastSeenAt : null,
      });
    } catch {
      // Unreadable storage starts a new forge rather than preventing launch.
    }
  },
}));
