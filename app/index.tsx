import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { Button, Screen, Text } from "@/components/ui";
import { t, type TranslationKey } from "@/i18n";
import {
  FREE_OFFLINE_HOURS,
  PREMIUM_OFFLINE_HOURS,
  UPGRADES,
  costOf,
  format,
  tapValue,
} from "@/logic/economy";
import { useForgeStore } from "@/store/useForgeStore";
import { usePremiumStore } from "@/store/usePremiumStore";
import { forgeTheme } from "@/theme/forge";
import { useTheme } from "@/theme";
import { gatedRow } from "@/theme/gatedRows";

const MIN_TOUCH_TARGET = 44;
/** How often idle output is credited. Four a second is smooth without being wasteful. */
const TICK_MS = 250;

export default function Forge() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  const isPremium = usePremiumStore((s) => s.isPremium);
  const balance = useForgeStore((s) => s.balance);
  const levels = useForgeStore((s) => s.levels);
  const prestigePoints = useForgeStore((s) => s.prestigePoints);
  const themeName = useForgeStore((s) => s.theme);
  const tap = useForgeStore((s) => s.tap);
  const tick = useForgeStore((s) => s.tick);
  const buy = useForgeStore((s) => s.buy);
  const doPrestige = useForgeStore((s) => s.doPrestige);
  const collectOffline = useForgeStore((s) => s.collectOffline);

  const perSecond = useForgeStore((s) => s.perSecond)(isPremium);
  const pending = useForgeStore((s) => s.pendingPrestige)();
  const multiplier = useForgeStore((s) => s.multiplier)();

  const anvil = forgeTheme(themeName);
  const collected = useRef(false);

  // Offline earnings are collected once per mount, before the ticker starts, so the two
  // cannot both credit the same seconds.
  useEffect(() => {
    if (collected.current) return;
    collected.current = true;
    const gained = collectOffline(isPremium);
    if (gained > 0) {
      Alert.alert(
        t("offlineTitle"),
        `${t("offlineBody", { n: format(gained) })}\n${t("offlineCapNote", {
          n: String(isPremium ? PREMIUM_OFFLINE_HOURS : FREE_OFFLINE_HOURS),
          premium: String(PREMIUM_OFFLINE_HOURS),
        })}`,
      );
    }
  }, [collectOffline, isPremium]);

  useEffect(() => {
    const id = setInterval(() => tick(TICK_MS / 1000, isPremium), TICK_MS);
    return () => clearInterval(id);
  }, [tick, isPremium]);

  const onTap = useCallback(() => {
    tap(isPremium);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [tap, isPremium]);

  const onBuy = useCallback(
    (id: string) => {
      if (buy(id, isPremium) === "bought") void Haptics.selectionAsync();
    },
    [buy, isPremium],
  );

  const onPrestige = useCallback(() => {
    if (pending <= 0) return;
    Alert.alert(t("prestigeConfirmTitle"), t("prestigeConfirmBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("prestigeCta"),
        style: "destructive",
        onPress: () => doPrestige(),
      },
    ]);
  }, [pending, doPrestige]);

  // What a tap is worth right now. Computed from the economy rather than remembered from the
  // last tap, so the readout is right before the player has tapped at all.
  const tapPreview = tapValue(levels, multiplier, isPremium);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text variant="display">{format(balance)}</Text>
            <Text variant="caption" tone="muted">
              {t("perSecondLabel", { n: format(perSecond) })}
            </Text>
          </View>
          {prestigePoints > 0 ? (
            <Text variant="caption" tone="accent">
              {t("multiplierLabel", { n: multiplier.toFixed(1) })}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tapPrompt")}
          onPress={onTap}
          style={{
            marginTop: spacing.lg,
            minHeight: 180,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius.lg,
            backgroundColor: anvil.anvil,
            borderWidth: 3,
            borderColor: anvil.glow,
          }}
        >
          <Text variant="display" color={anvil.glow}>
            {t("tapPrompt")}
          </Text>
          <Text
            variant="caption"
            color={anvil.ink}
            style={{ marginTop: spacing.xs }}
          >
            {t("perTapLabel", { n: format(tapPreview) })}
          </Text>
        </Pressable>

        <Text variant="micro" tone="faint" style={{ marginTop: spacing.xl }}>
          {t("upgradesTitle").toUpperCase()}
        </Text>
        {UPGRADES.map((upgrade) => {
          const level = levels[upgrade.id] ?? 0;
          const cost = costOf(upgrade.id, level);
          const affordable = balance >= cost;
          const row = gatedRow(colors, affordable);
          const name = t(upgrade.nameKey as TranslationKey);
          return (
            <Pressable
              key={upgrade.id}
              accessibilityRole="button"
              accessibilityLabel={t("buyUpgrade", { name, cost: format(cost) })}
              accessibilityState={{ disabled: !affordable }}
              onPress={() => onBuy(upgrade.id)}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.base,
                paddingVertical: spacing.sm,
                marginTop: spacing.xs,
                borderRadius: radius.md,
                backgroundColor: row.background,
                borderWidth: 1,
                borderColor: affordable ? colors.accent : colors.border,
                // A price you cannot meet is shown, not hidden — it is the next
                // goal, so it must stay readable rather than be washed out.
                opacity: row.opacity,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="body">{name}</Text>
                <Text variant="caption" tone="muted">
                  {t("upgradeLevel", { n: String(level) })}
                </Text>
              </View>
              <Text variant="bodyStrong" color={row.label}>
                {format(cost)}
              </Text>
            </Pressable>
          );
        })}

        <Text variant="micro" tone="faint" style={{ marginTop: spacing.xl }}>
          {t("prestigeTitle").toUpperCase()}
        </Text>
        <Button
          label={
            pending > 0
              ? t("prestigeReady", { n: String(pending) })
              : t("prestigeNotYet")
          }
          variant="secondary"
          fullWidth
          onPress={onPrestige}
          disabled={pending <= 0}
          style={{ marginTop: spacing.sm }}
        />

        <Button
          label={t("settingsTitle")}
          variant="ghost"
          fullWidth
          onPress={() => router.push("/settings")}
          style={{ marginTop: spacing.lg }}
        />
      </Screen>
      <BannerAdSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center" },
});
