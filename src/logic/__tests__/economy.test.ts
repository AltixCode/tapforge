import {
  FREE_OFFLINE_HOURS,
  PREMIUM_MULTIPLIER,
  PREMIUM_OFFLINE_HOURS,
  UPGRADES,
  type Levels,
  bulkCost,
  costOf,
  format,
  offlineEarnings,
  outputPerSecond,
  prestigeGain,
  prestigeMultiplier,
  tapValue,
} from "../economy";

const none: Levels = {};

describe("costOf — a geometric curve", () => {
  it("is the base cost at level zero", () => {
    for (const upgrade of UPGRADES) {
      expect(costOf(upgrade.id, 0)).toBe(upgrade.baseCost);
    }
  });

  it("grows by the upgrade growth factor each level", () => {
    const upgrade = UPGRADES[0]!;
    expect(costOf(upgrade.id, 1)).toBeCloseTo(
      upgrade.baseCost * upgrade.growth,
      6,
    );
    expect(costOf(upgrade.id, 3)).toBeCloseTo(
      upgrade.baseCost * upgrade.growth ** 3,
      6,
    );
  });

  it("is zero for an upgrade that does not exist rather than NaN", () => {
    expect(costOf("no-such-upgrade", 2)).toBe(0);
  });
});

describe("bulkCost — buying several levels at once", () => {
  it("is the SUM of the individual costs, not the last one times the count", () => {
    // The classic idle-game bug: `costOf(level) * count` undercharges enormously for a
    // geometric curve, and a player can buy a hundred levels for the price of about three.
    const upgrade = UPGRADES[0]!;
    const expected =
      costOf(upgrade.id, 0) + costOf(upgrade.id, 1) + costOf(upgrade.id, 2);
    expect(bulkCost(upgrade.id, 0, 3)).toBeCloseTo(expected, 6);
  });

  it("matches a one-by-one purchase for any starting level", () => {
    const upgrade = UPGRADES[1]!;
    let manual = 0;
    for (let i = 5; i < 12; i += 1) manual += costOf(upgrade.id, i);
    expect(bulkCost(upgrade.id, 5, 7)).toBeCloseTo(manual, 6);
  });

  it("is zero for a count of zero or less", () => {
    expect(bulkCost(UPGRADES[0]!.id, 0, 0)).toBe(0);
    expect(bulkCost(UPGRADES[0]!.id, 0, -3)).toBe(0);
  });
});

describe("tapValue", () => {
  it("starts at one", () => {
    expect(tapValue(none, 1, false)).toBe(1);
  });

  it("rises with the tap upgrade", () => {
    const tapUpgrade = UPGRADES.find((u) => u.kind === "tap")!;
    expect(tapValue({ [tapUpgrade.id]: 3 }, 1, false)).toBeGreaterThan(1);
  });

  it("doubles for a paying player — that is the paywall's first claim", () => {
    expect(tapValue(none, 1, true)).toBe(
      tapValue(none, 1, false) * PREMIUM_MULTIPLIER,
    );
  });

  it("scales with the prestige multiplier", () => {
    expect(tapValue(none, 3, false)).toBe(tapValue(none, 1, false) * 3);
  });
});

describe("outputPerSecond", () => {
  it("is zero before anything is bought — an idle game must be started", () => {
    expect(outputPerSecond(none, 1, false)).toBe(0);
  });

  it("rises with an idle upgrade", () => {
    const idle = UPGRADES.find((u) => u.kind === "idle")!;
    expect(outputPerSecond({ [idle.id]: 1 }, 1, false)).toBeGreaterThan(0);
  });

  it("doubles for a paying player", () => {
    const idle = UPGRADES.find((u) => u.kind === "idle")!;
    const levels = { [idle.id]: 4 };
    expect(outputPerSecond(levels, 1, true)).toBeCloseTo(
      outputPerSecond(levels, 1, false) * PREMIUM_MULTIPLIER,
      6,
    );
  });
});

describe('offlineEarnings — "it runs while you sleep"', () => {
  const idle = UPGRADES.find((u) => u.kind === "idle")!;
  const levels = { [idle.id]: 5 };
  const rate = outputPerSecond(levels, 1, false);

  it("pays for the time that actually passed", () => {
    const tenMinutes = 600_000;
    expect(offlineEarnings(levels, 1, false, tenMinutes)).toBeCloseTo(
      rate * 600,
      6,
    );
  });

  it("caps a free player at eight hours", () => {
    const twoDays = 48 * 3600_000;
    expect(offlineEarnings(levels, 1, false, twoDays)).toBeCloseTo(
      rate * FREE_OFFLINE_HOURS * 3600,
      6,
    );
  });

  it("caps a paying player at twenty-four — the third claim, and it is three times more", () => {
    const twoDays = 48 * 3600_000;
    const premiumRate = outputPerSecond(levels, 1, true);
    expect(offlineEarnings(levels, 1, true, twoDays)).toBeCloseTo(
      premiumRate * PREMIUM_OFFLINE_HOURS * 3600,
      6,
    );
    expect(PREMIUM_OFFLINE_HOURS).toBeGreaterThan(FREE_OFFLINE_HOURS);
  });

  it("pays nothing for a negative gap", () => {
    // A device clock moved backwards must not mint currency.
    expect(offlineEarnings(levels, 1, false, -5_000_000)).toBe(0);
  });

  it("pays nothing with no idle upgrades, however long the gap", () => {
    expect(offlineEarnings(none, 1, false, 48 * 3600_000)).toBe(0);
  });
});

describe("prestige", () => {
  it("gives nothing below the threshold", () => {
    expect(prestigeGain(0)).toBe(0);
    expect(prestigeGain(100)).toBe(0);
  });

  it("gives more for more lifetime output, and never goes backwards", () => {
    let previous = 0;
    for (const total of [1e6, 1e7, 1e8, 1e9, 1e12]) {
      const gain = prestigeGain(total);
      expect(gain).toBeGreaterThanOrEqual(previous);
      previous = gain;
    }
  });

  it("turns points into a multiplier that starts at one", () => {
    expect(prestigeMultiplier(0)).toBe(1);
    expect(prestigeMultiplier(10)).toBeGreaterThan(1);
  });

  it("is always a whole number of points", () => {
    for (const total of [1e6, 3.7e8, 9.1e11]) {
      expect(Number.isInteger(prestigeGain(total))).toBe(true);
    }
  });
});

describe("format — an idle game is unreadable without it", () => {
  it("leaves small numbers alone", () => {
    expect(format(0)).toBe("0");
    expect(format(42)).toBe("42");
    expect(format(999)).toBe("999");
  });

  it("abbreviates the big ones", () => {
    expect(format(1_500)).toBe("1.50K");
    expect(format(2_400_000)).toBe("2.40M");
    expect(format(7_800_000_000)).toBe("7.80B");
  });

  it("handles a number past the suffix list without printing undefined", () => {
    expect(format(1e42)).not.toContain("undefined");
  });

  it("never shows a negative balance as a huge number", () => {
    expect(format(-5)).toBe("0");
  });
});
