import AsyncStorage from "@react-native-async-storage/async-storage";

import { FORGE_CACHE_KEY, useForgeStore } from "../useForgeStore";
import {
  FREE_OFFLINE_HOURS,
  PREMIUM_MULTIPLIER,
  UPGRADES,
  costOf,
} from "@/logic/economy";

const IDLE = UPGRADES.find((u) => u.kind === "idle")!;
const TAP = UPGRADES.find((u) => u.kind === "tap")!;

const reset = () =>
  useForgeStore.setState({
    balance: 0,
    lifetime: 0,
    levels: {},
    prestigePoints: 0,
    theme: "default",
    lastSeenAt: null,
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  reset();
});

describe("tapping", () => {
  it("adds to the balance and to lifetime", () => {
    const gained = useForgeStore.getState().tap(false);
    expect(gained).toBe(1);
    expect(useForgeStore.getState().balance).toBe(1);
    expect(useForgeStore.getState().lifetime).toBe(1);
  });

  it("doubles for a paying player", () => {
    expect(useForgeStore.getState().tap(true)).toBe(PREMIUM_MULTIPLIER);
  });
});

describe("buying upgrades", () => {
  it("refuses when the balance is short, and takes nothing", () => {
    expect(useForgeStore.getState().buy(TAP.id, false)).toBe("too-expensive");
    expect(useForgeStore.getState().balance).toBe(0);
    expect(useForgeStore.getState().levels[TAP.id]).toBeUndefined();
  });

  it("spends exactly the listed cost", () => {
    useForgeStore.setState({ balance: 1000 });
    const cost = costOf(TAP.id, 0);
    expect(useForgeStore.getState().buy(TAP.id, false)).toBe("bought");
    expect(useForgeStore.getState().balance).toBeCloseTo(1000 - cost, 6);
    expect(useForgeStore.getState().levels[TAP.id]).toBe(1);
  });

  it("charges more for the second level than the first", () => {
    useForgeStore.setState({ balance: 1e6 });
    const first = costOf(TAP.id, 0);
    useForgeStore.getState().buy(TAP.id, false);
    const second = costOf(TAP.id, 1);
    expect(second).toBeGreaterThan(first);
  });

  it("does not discount for a paying player — the purchase multiplies output, not prices", () => {
    useForgeStore.setState({ balance: 1000 });
    const before = useForgeStore.getState().balance;
    useForgeStore.getState().buy(TAP.id, true);
    expect(before - useForgeStore.getState().balance).toBeCloseTo(
      costOf(TAP.id, 0),
      6,
    );
  });

  it("rejects an upgrade that does not exist", () => {
    useForgeStore.setState({ balance: 1e9 });
    expect(useForgeStore.getState().buy("no-such-thing", false)).toBe(
      "unknown",
    );
  });

  it("reports affordability honestly", () => {
    expect(useForgeStore.getState().canAfford(TAP.id)).toBe(false);
    useForgeStore.setState({ balance: 1e6 });
    expect(useForgeStore.getState().canAfford(TAP.id)).toBe(true);
    expect(useForgeStore.getState().canAfford("nope")).toBe(false);
  });
});

describe("idle output", () => {
  it("earns nothing per tick until something idle is bought", () => {
    useForgeStore.getState().tick(10, false);
    expect(useForgeStore.getState().balance).toBe(0);
  });

  it("earns per second once it is", () => {
    useForgeStore.setState({ levels: { [IDLE.id]: 2 } });
    useForgeStore.getState().tick(10, false);
    expect(useForgeStore.getState().balance).toBeGreaterThan(0);
  });

  it("ignores a zero or negative tick", () => {
    useForgeStore.setState({ levels: { [IDLE.id]: 2 } });
    useForgeStore.getState().tick(0, false);
    useForgeStore.getState().tick(-5, false);
    expect(useForgeStore.getState().balance).toBe(0);
  });
});

describe("offline earnings", () => {
  it("banks nothing on a first run, and remembers the moment instead", () => {
    // There is no "away" to measure yet; paying for it would mint currency on install.
    expect(useForgeStore.getState().collectOffline(false, 1_000_000)).toBe(0);
    expect(useForgeStore.getState().lastSeenAt).toBe(1_000_000);
  });

  it("pays for the gap since the last save", () => {
    useForgeStore.setState({ levels: { [IDLE.id]: 4 }, lastSeenAt: 0 });
    const gained = useForgeStore.getState().collectOffline(false, 60_000);
    expect(gained).toBeGreaterThan(0);
    expect(useForgeStore.getState().balance).toBeCloseTo(gained, 6);
  });

  it("caps a free player, and a paying player gets more", () => {
    const away = 48 * 3600_000;
    useForgeStore.setState({ levels: { [IDLE.id]: 4 }, lastSeenAt: 0 });
    const free = useForgeStore.getState().collectOffline(false, away);

    reset();
    useForgeStore.setState({ levels: { [IDLE.id]: 4 }, lastSeenAt: 0 });
    const paid = useForgeStore.getState().collectOffline(true, away);

    expect(paid).toBeGreaterThan(free);
  });

  it("pays nothing when the clock has moved backwards", () => {
    useForgeStore.setState({
      levels: { [IDLE.id]: 4 },
      lastSeenAt: 10_000_000,
    });
    expect(useForgeStore.getState().collectOffline(false, 5_000_000)).toBe(0);
  });

  it("never pays more than the free cap however long the gap", () => {
    useForgeStore.setState({ levels: { [IDLE.id]: 1 }, lastSeenAt: 0 });
    const year = 365 * 24 * 3600_000;
    const gained = useForgeStore.getState().collectOffline(false, year);
    const perSecond = useForgeStore.getState().perSecond(false);
    expect(gained).toBeCloseTo(perSecond * FREE_OFFLINE_HOURS * 3600, 4);
  });
});

describe("prestige", () => {
  it("is refused before the threshold, and nothing is lost", () => {
    useForgeStore.setState({
      lifetime: 1000,
      balance: 500,
      levels: { [TAP.id]: 3 },
    });
    expect(useForgeStore.getState().doPrestige()).toBe("not-yet");
    expect(useForgeStore.getState().levels[TAP.id]).toBe(3);
  });

  it("grants points and resets the run", () => {
    useForgeStore.setState({
      lifetime: 1e9,
      balance: 5e8,
      levels: { [TAP.id]: 20 },
    });
    expect(useForgeStore.getState().doPrestige()).toBe("done");
    expect(useForgeStore.getState().prestigePoints).toBeGreaterThan(0);
    expect(useForgeStore.getState().balance).toBe(0);
    expect(useForgeStore.getState().levels).toEqual({});
  });

  it("resets lifetime too, so the same earnings cannot be cashed twice", () => {
    // Otherwise prestige becomes a button that prints multipliers.
    useForgeStore.setState({ lifetime: 1e9 });
    useForgeStore.getState().doPrestige();
    expect(useForgeStore.getState().lifetime).toBe(0);
    expect(useForgeStore.getState().doPrestige()).toBe("not-yet");
  });

  it("raises the multiplier, which raises the tap", () => {
    const before = useForgeStore.getState().tap(false);
    reset();
    useForgeStore.setState({ lifetime: 1e9 });
    useForgeStore.getState().doPrestige();
    expect(useForgeStore.getState().prestigePoints).toBeGreaterThan(0);
    expect(useForgeStore.getState().tap(false)).toBeGreaterThan(before);
  });
});

describe("themes", () => {
  it("is locked for a free player and open to a paying one", () => {
    useForgeStore.getState().setTheme("frost", false);
    expect(useForgeStore.getState().theme).toBe("default");
    useForgeStore.getState().setTheme("frost", true);
    expect(useForgeStore.getState().theme).toBe("frost");
  });

  it("refuses a theme that does not exist", () => {
    useForgeStore.getState().setTheme("plaid", true);
    expect(useForgeStore.getState().theme).toBe("default");
  });
});

describe("persistence", () => {
  it("round-trips progress", async () => {
    useForgeStore.setState({
      balance: 4200,
      lifetime: 9000,
      levels: { [IDLE.id]: 7 },
      prestigePoints: 3,
    });
    await useForgeStore.getState().persist();

    reset();
    await useForgeStore.getState().hydrate();
    expect(useForgeStore.getState().balance).toBe(4200);
    expect(useForgeStore.getState().levels[IDLE.id]).toBe(7);
    expect(useForgeStore.getState().prestigePoints).toBe(3);
  });

  it("drops levels for upgrades that do not exist", async () => {
    await AsyncStorage.setItem(
      FORGE_CACHE_KEY,
      JSON.stringify({ balance: 10, levels: { ghost: 5, [IDLE.id]: 2 } }),
    );
    await useForgeStore.getState().hydrate();
    expect(useForgeStore.getState().levels).toEqual({ [IDLE.id]: 2 });
  });

  it("starts clean on stored rubbish rather than a negative balance", async () => {
    await AsyncStorage.setItem(
      FORGE_CACHE_KEY,
      '{"balance":-99,"levels":"none","theme":7}',
    );
    await useForgeStore.getState().hydrate();
    expect(useForgeStore.getState().balance).toBe(0);
    expect(useForgeStore.getState().levels).toEqual({});
    expect(useForgeStore.getState().theme).toBe("default");
  });
});
