import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  View,
} from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { Screen, Text } from "@/components/ui";
import { t, type TranslationKey } from "@/i18n";
import { showPrivacyOptionsForm } from "@/monetization/ads";
import {
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
} from "@/monetization/config";
import { useAdsConsentStore } from "@/store/useAdsConsentStore";
import { useForgeStore } from "@/store/useForgeStore";
import { FORGE_THEME_NAMES, forgeTheme } from "@/theme/forge";
import { usePremiumStore } from "@/store/usePremiumStore";
import { useTheme, type ThemePreference } from "@/theme";

const THEME_OPTIONS: {
  key: ThemePreference;
  label: "themeSystem" | "themeLight" | "themeDark";
}[] = [
  { key: "system", label: "themeSystem" },
  { key: "light", label: "themeLight" },
  { key: "dark", label: "themeDark" },
];

function SectionLabel({ children }: { children: string }) {
  const { spacing } = useTheme();
  return (
    <Text variant="micro" tone="faint" style={{ marginTop: spacing.xl }}>
      {children}
    </Text>
  );
}

function Row({
  label,
  detail,
  onPress,
  loading = false,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  /** Shows a spinner in place of the detail and blocks re-entry. */
  loading?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress || loading, busy: loading }}
      disabled={!onPress || loading}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingVertical: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: loading ? 0.6 : 1,
      }}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const FORGE_LABEL: Record<string, TranslationKey> = {
  default: "themeDefault",
  ember: "themeEmber",
  frost: "themeFrost",
  verdant: "themeVerdant",
};

export default function Settings() {
  const router = useRouter();
  const { colors, spacing, radius, preference, setPreference } = useTheme();
  const forgeName = useForgeStore((s) => s.theme);
  const setForgeTheme = useForgeStore((s) => s.setTheme);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const restore = usePremiumStore((s) => s.restore);
  const offerPrivacyOptions = useAdsConsentStore(
    (s) => s.consent.offerPrivacyOptions,
  );

  const version = Constants.expoConfig?.version ?? "1.0.0";

  // The store's own `isPurchasing` flag covers both purchase() and restore(), so it can't
  // be used here without also flickering true whenever a purchase happens to be in flight
  // elsewhere. Local state keeps this row's spinner scoped to a restore this row started.
  const [isRestoring, setIsRestoring] = useState(false);

  const onRestore = () => {
    setIsRestoring(true);
    void restore()
      .then((result) => {
        if (result === "purchased") {
          Alert.alert(t("restoredTitle"), t("restoredBody"));
        } else {
          Alert.alert(t("nothingToRestoreTitle"), t("noPriorPurchases"));
        }
      })
      .finally(() => setIsRestoring(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll>
        <SectionLabel>{t("appearance")}</SectionLabel>
        <View
          style={{
            flexDirection: "row",
            marginTop: spacing.sm,
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            padding: spacing.xs,
          }}
        >
          {THEME_OPTIONS.map((option) => {
            const selected = preference === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityLabel={t(option.label)}
                accessibilityState={{ selected }}
                onPress={() => setPreference(option.key)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: radius.sm,
                  backgroundColor: selected ? colors.surface : "transparent",
                }}
              >
                <Text variant="callout" tone={selected ? "default" : "muted"}>
                  {t(option.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{t("forgeThemeTitle")}</SectionLabel>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginTop: spacing.sm,
          }}
        >
          {FORGE_THEME_NAMES.map((name) => {
            const selected = forgeName === name;
            // Locked themes are visible: nobody buys what they cannot see.
            const locked = !isPremium && name !== "default";
            const swatch = forgeTheme(name);
            return (
              <Pressable
                key={name}
                accessibilityRole="radio"
                accessibilityLabel={
                  locked
                    ? `${t(FORGE_LABEL[name]!)} — ${t("lockedTitle")}`
                    : t(FORGE_LABEL[name]!)
                }
                accessibilityState={{ selected }}
                onPress={() =>
                  locked
                    ? router.push("/paywall")
                    : setForgeTheme(name, isPremium)
                }
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.full,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.accent : colors.border,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: radius.sm,
                    backgroundColor: swatch.glow,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
                <Text variant="callout" tone={selected ? "default" : "muted"}>
                  {t(FORGE_LABEL[name]!)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{t("settingsPurchase")}</SectionLabel>
        {isPremium ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Text variant="body">{t("proActive")}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {t("proActiveDesc")}
            </Text>
          </View>
        ) : (
          <Row
            label={t("removeAdsCta")}
            onPress={() => router.push("/paywall")}
          />
        )}
        <Row
          label={t("restorePurchases")}
          onPress={onRestore}
          loading={isRestoring}
        />

        {offerPrivacyOptions ? (
          <>
            <SectionLabel>{t("privacyOptions")}</SectionLabel>
            <Row
              label={t("privacyOptionsDesc")}
              onPress={() => void showPrivacyOptionsForm()}
            />
          </>
        ) : null}

        <SectionLabel>{t("settingsLegal")}</SectionLabel>
        <Row
          label={t("privacyPolicy")}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
        <Row
          label={t("termsOfUse")}
          onPress={() => void Linking.openURL(TERMS_URL)}
        />

        <SectionLabel>{t("settingsAbout")}</SectionLabel>
        <Row
          label={t("contactSupport")}
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
        <Row label={t("versionLabel", { version })} />
      </Screen>
      <BannerAdSlot />
    </View>
  );
}
