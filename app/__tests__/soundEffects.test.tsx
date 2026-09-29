import { fireEvent } from "@testing-library/react-native";
import React from "react";

import Home from "../index";
import { renderWithProviders } from "@/components/__tests__/renderWithProviders";
import { t } from "@/i18n";
import { UPGRADES, costOf, format } from "@/logic/economy";
import { useAdsConsentStore } from "@/store/useAdsConsentStore";
import { useForgeStore } from "@/store/useForgeStore";
import { usePremiumStore } from "@/store/usePremiumStore";

// The forge screen calls the shared sound hook directly, so it is mocked at
// the module boundary the same way `@/hooks/useSoundEffects` is mocked in
// toppl's `soundEffects.test.tsx` -- these assertions are about which name
// the screen calls `play` with, not about the native audio player, which is
// `useSoundEffects`'s own test's job.
const mockPlay = jest.fn();
jest.mock("@/hooks/useSoundEffects", () => ({
  useSoundEffects: () => mockPlay,
}));

const TAP = UPGRADES.find((u) => u.kind === "tap")!;

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({
    consent: { canServeAds: true, offerPrivacyOptions: false },
  });
  useForgeStore.setState({
    balance: 0,
    lifetime: 0,
    levels: {},
    prestigePoints: 0,
    theme: "default",
    lastSeenAt: Date.now(),
  });
});

describe("Forge sound effects", () => {
  it("plays a tap sound on each anvil tap", async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t("tapPrompt")));
    expect(mockPlay).toHaveBeenCalledWith("tap");
  });

  it("plays a success sound on an ordinary upgrade purchase", async () => {
    useForgeStore.setState({ balance: 1000 });
    const { getByLabelText } = await renderWithProviders(<Home />);
    const label = t("buyUpgrade", {
      name: t(TAP.nameKey as "upgradeHammer"),
      cost: format(costOf(TAP.id, 0)),
    });
    await fireEvent.press(getByLabelText(label));
    expect(mockPlay).toHaveBeenCalledWith("success");
    expect(mockPlay).not.toHaveBeenCalledWith("pop");
  });

  it("plays a pop sound on a milestone level (every fifth) instead of the routine chime", async () => {
    useForgeStore.setState({ balance: 1_000_000, levels: { [TAP.id]: 4 } });
    const { getByLabelText } = await renderWithProviders(<Home />);
    const label = t("buyUpgrade", {
      name: t(TAP.nameKey as "upgradeHammer"),
      cost: format(costOf(TAP.id, 4)),
    });
    await fireEvent.press(getByLabelText(label));
    expect(useForgeStore.getState().levels[TAP.id]).toBe(5);
    expect(mockPlay).toHaveBeenCalledWith("pop");
    expect(mockPlay).not.toHaveBeenCalledWith("success");
  });

  it("does not play a purchase sound when the upgrade cannot be afforded", async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    const label = t("buyUpgrade", {
      name: t(TAP.nameKey as "upgradeHammer"),
      cost: format(costOf(TAP.id, 0)),
    });
    await fireEvent.press(getByLabelText(label));
    expect(mockPlay).not.toHaveBeenCalledWith("success");
    expect(mockPlay).not.toHaveBeenCalledWith("pop");
  });
});
