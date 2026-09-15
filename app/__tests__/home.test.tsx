import { act, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import Home from '../index';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { UPGRADES, costOf, format } from '@/logic/economy';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useForgeStore } from '@/store/useForgeStore';
import { usePremiumStore } from '@/store/usePremiumStore';

const TAP = UPGRADES.find((u) => u.kind === 'tap')!;
const IDLE = UPGRADES.find((u) => u.kind === 'idle')!;

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  useForgeStore.setState({
    balance: 0,
    lifetime: 0,
    levels: {},
    prestigePoints: 0,
    theme: 'default',
    // Non-null so the offline alert does not fire in every test.
    lastSeenAt: Date.now(),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the forge', () => {
  it('starts at zero and shows what a tap is worth before anything is tapped', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    expect(getByText('0')).toBeTruthy();
    expect(getByText(t('perTapLabel', { n: '1' }))).toBeTruthy();
  });

  it('earns on a tap', async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('tapPrompt')));
    expect(useForgeStore.getState().balance).toBe(1);
  });

  it('shows the doubled tap value to a paying player', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { getByText } = await renderWithProviders(<Home />);
    expect(getByText(t('perTapLabel', { n: '2' }))).toBeTruthy();
  });

  it('buys an upgrade when it can be afforded, and refuses when it cannot', async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    const label = t('buyUpgrade', { name: t(TAP.nameKey as 'upgradeHammer'), cost: format(costOf(TAP.id, 0)) });

    await fireEvent.press(getByLabelText(label));
    expect(useForgeStore.getState().levels[TAP.id]).toBeUndefined();

    useForgeStore.setState({ balance: 1000 });
    const rich = await renderWithProviders(<Home />);
    await fireEvent.press(rich.getByLabelText(label));
    expect(useForgeStore.getState().levels[TAP.id]).toBe(1);
  });

  it('credits idle output on a tick', async () => {
    jest.useFakeTimers();
    useForgeStore.setState({ levels: { [IDLE.id]: 4 } });
    await renderWithProviders(<Home />);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(useForgeStore.getState().balance).toBeGreaterThan(0);
  });

  it('reports offline earnings on mount, and says what the cap is', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useForgeStore.setState({ levels: { [IDLE.id]: 4 }, lastSeenAt: Date.now() - 3600_000 });

    await renderWithProviders(<Home />);
    expect(alert.mock.calls[0]![0]).toBe(t('offlineTitle'));
    // The cap is stated, not implied — it is the difference the purchase sells.
    expect(String(alert.mock.calls[0]![1])).toContain('8');
  });

  it('does not offer prestige before it is earned', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    expect(getByText(t('prestigeNotYet'))).toBeTruthy();
  });

  it('offers prestige once the lifetime total is there, and confirms first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useForgeStore.setState({ lifetime: 1e9 });
    const { getByText } = await renderWithProviders(<Home />);

    const pending = useForgeStore.getState().pendingPrestige();
    await fireEvent.press(getByText(t('prestigeReady', { n: String(pending) })));
    // Resetting everything without asking would be a destructive action taken on one tap.
    expect(alert.mock.calls.at(-1)![0]).toBe(t('prestigeConfirmTitle'));
    expect(useForgeStore.getState().prestigePoints).toBe(0);
  });

  it('shows the prestige multiplier once there is one', async () => {
    useForgeStore.setState({ prestigePoints: 5 });
    const { getByText } = await renderWithProviders(<Home />);
    expect(getByText(t('multiplierLabel', { n: '1.5' }))).toBeTruthy();
  });

  it('routes to settings', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t('settingsTitle')));
    expect(testRouter.push).toHaveBeenCalledWith('/settings');
  });
});
