import { fireEvent } from '@testing-library/react-native';
import React from 'react';

import Settings from '../settings';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useForgeStore } from '@/store/useForgeStore';
import { usePremiumStore } from '@/store/usePremiumStore';

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
    lastSeenAt: Date.now(),
  });
});

describe('the forge theme picker', () => {
  it('shows locked themes rather than hiding them', async () => {
    const { getByLabelText } = await renderWithProviders(<Settings />);
    expect(getByLabelText(t('themeDefault'))).toBeTruthy();
    expect(getByLabelText(`${t('themeFrost')} — ${t('lockedTitle')}`)).toBeTruthy();
  });

  it('sends a free player to the paywall, changing nothing', async () => {
    const { getByLabelText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByLabelText(`${t('themeEmber')} — ${t('lockedTitle')}`));
    expect(testRouter.push).toHaveBeenCalledWith('/paywall');
    expect(useForgeStore.getState().theme).toBe('default');
  });

  it('lets a paying player choose one', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { getByLabelText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByLabelText(t('themeVerdant')));
    expect(useForgeStore.getState().theme).toBe('verdant');
  });
});
