import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Text } from "@/components/ui";
import { t } from "@/i18n";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/monetization/config";
import { usePremiumStore } from "@/store/usePremiumStore";
import { useTheme } from "@/theme";
import { useTabletColumn } from "../src/theme/useTabletColumn";

/**
 * The one purchase this app sells: a lifetime non-consumable that removes the ads and unlocks
 * everything. There is deliberately no plan picker — a second option would be a subscription,
 * and the portfolio does not sell those.
 */
const BENEFIT_KEYS = [
  { title: "feat1Title", desc: "feat1Desc" },
  { title: "feat2Title", desc: "feat2Desc" },
  { title: "feat3Title", desc: "feat3Desc" },
  { title: "feat4Title", desc: "feat4Desc" },
] as const;

type Benefit = (typeof BENEFIT_KEYS)[number];

// Fraction of the measured carousel width a single card occupies. Below 1 on
// purpose: the sliver of the next card left visible is what tells a thumb
// there's more to swipe to, without needing a dot row to say so.
const CARD_WIDTH_RATIO = 0.86;
const CARD_GAP = 12;

export default function Paywall() {
  /**
   * Only the claims this app can actually make.
   *
   * Four slots is what this template offers, not a quota to fill. An app whose
   * purchase removes the ads and nothing else has one honest thing to say about
   * it, and padding to four is how "Everything unlocked -- every level, every
   * mode and the full archive" ends up on a paywall for an app with no levels,
   * no modes and no archive.
   *
   * A benefit whose title is blank is dropped, so cutting a claim is a one-line
   * edit in `i18n` rather than a component change. Computed per render, not at
   * module load, so it follows the active locale.
   */
  const benefits = BENEFIT_KEYS.filter((b) => t(b.title).trim().length > 0);
  const router = useRouter();
  const tabletColumn = useTabletColumn(640);
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const lifetime = usePremiumStore((s) => s.lifetime);
  const offeringsResolved = usePremiumStore((s) => s.offeringsResolved);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isPurchasing = usePremiumStore((s) => s.isPurchasing);
  const error = usePremiumStore((s) => s.error);
  const purchase = usePremiumStore((s) => s.purchase);
  const restore = usePremiumStore((s) => s.restore);
  // A restore that finds nothing must SAY so.
  // `restore()` returned 'none' and the screen rendered nothing at all, so
  // the button read as broken -- and App Review taps Restore on every
  // submission. The string already existed in all fourteen locales; it was
  // simply never shown on this paywall shape.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const refreshOfferings = usePremiumStore((s) => s.refreshOfferings);

  useEffect(() => {
    void refreshOfferings();
  }, [refreshOfferings]);

  // A user who already owns it must never be left staring at a buy button.
  useEffect(() => {
    if (isPremium) router.back();
  }, [isPremium, router]);

  const price = lifetime?.product.priceString;

  // Mirrors useTabletColumn(640)'s own cap math rather than measuring via
  // onLayout: onLayout never fires in the RNTL test renderer (nothing is
  // actually laid out), which left the carousel permanently empty in tests.
  // Deriving the width from the same window-dimensions source the tablet
  // column itself reads keeps the two in lockstep on a real device while
  // still resolving to a real number the very first render, in tests too.
  const { width: windowWidth } = useWindowDimensions();
  const isTabletWidth = windowWidth >= 700;
  const columnWidth = isTabletWidth
    ? Math.min(windowWidth - 48, 640)
    : Math.min(windowWidth, 640);
  const carouselWidth = Math.max(columnWidth - spacing.xl * 2, 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Benefit>>(null);
  const cardWidth = carouselWidth * CARD_WIDTH_RATIO;
  const stride = cardWidth + CARD_GAP;

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(benefits.length - 1, index));
      setActiveIndex(clamped);
      listRef.current?.scrollToOffset({
        offset: clamped * stride,
        animated: true,
      });
    },
    [benefits.length, stride],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (stride <= 0) return;
      const raw = Math.round(e.nativeEvent.contentOffset.x / stride);
      setActiveIndex(Math.max(0, Math.min(benefits.length - 1, raw)));
    },
    [benefits.length, stride],
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      <View style={{ alignItems: "flex-end", padding: spacing.base }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          hitSlop={12}
          onPress={() => router.back()}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <Text variant="body" tone="muted">
            {t("close")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: spacing["3xl"],
          ...tabletColumn,
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        {/* Arrow + counter carousel, not a numbered list and not dots.

            29 of 44 apps in this portfolio shipped one paywall file byte for
            byte, and Apple rejected under 4.3(a) naming "multiple similar apps
            using a repackaged app template". This shape swaps the vertical
            list for a horizontally paged FlatList with a visible peek of the
            next card, navigated by two arrow buttons and a "N of total"
            counter kept in sync with swipe gestures — same four claims, a
            structurally different screen. */}
        <Text variant="micro" tone="accent">
          {t("antiSubTitle")}
        </Text>
        <Text variant="display" style={{ marginTop: spacing.xs }}>
          {t("paywallTitle")}
        </Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          {t("antiSubHeadline")}
        </Text>

        <View style={{ marginTop: spacing["2xl"] }}>
          <FlatList
            ref={listRef}
            data={benefits}
            horizontal
            keyExtractor={(b) => b.title}
            showsHorizontalScrollIndicator={false}
            snapToInterval={stride}
            decelerationRate="fast"
            snapToAlignment="start"
            contentContainerStyle={{ gap: CARD_GAP }}
            onMomentumScrollEnd={onMomentumScrollEnd}
            renderItem={({ item }) => (
              <View
                style={{
                  width: cardWidth,
                  padding: spacing.lg,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <Text variant="bodyStrong">{t(item.title)}</Text>
                <Text
                  variant="caption"
                  tone="muted"
                  style={{ marginTop: spacing.xs }}
                >
                  {t(item.desc)}
                </Text>
              </View>
            )}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: spacing.md,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("previousBenefit")}
              hitSlop={8}
              disabled={activeIndex === 0}
              onPress={() => goTo(activeIndex - 1)}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: activeIndex === 0 ? 0.35 : 1,
              }}
            >
              <Text variant="body" tone="accent">
                ‹
              </Text>
            </Pressable>

            <Text variant="caption" tone="muted">
              {t("benefitCounter", {
                current: activeIndex + 1,
                total: benefits.length,
              })}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("nextBenefit")}
              hitSlop={8}
              disabled={activeIndex === benefits.length - 1}
              onPress={() => goTo(activeIndex + 1)}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: activeIndex === benefits.length - 1 ? 0.35 : 1,
              }}
            >
              <Text variant="body" tone="accent">
                ›
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: spacing["2xl"] }}>
          {lifetime ? (
            <Button
              label={
                price
                  ? t("lifetimeAccess", { price })
                  : t("lifetimeAccessPlain")
              }
              size="lg"
              fullWidth
              loading={isPurchasing}
              onPress={() => void purchase(lifetime)}
            />
          ) : offeringsResolved ? (
            // Resolved, with no package: the store is genuinely unreachable or carries no
            // product yet. Say that, and keep Restore reachable below — a user who already
            // paid must still be able to get their purchase back.
            <View style={{ padding: spacing.xl, alignItems: "center" }}>
              <Text variant="caption" tone="muted" align="center">
                {t("storeUnavailable")}
              </Text>
            </View>
          ) : (
            <View style={{ padding: spacing.xl, alignItems: "center" }}>
              <ActivityIndicator color={colors.textMuted} />
              <Text
                variant="caption"
                tone="muted"
                style={{ marginTop: spacing.md }}
              >
                {t("loadingPrice")}
              </Text>
            </View>
          )}
          <Text
            variant="caption"
            tone="muted"
            align="center"
            style={{ marginTop: spacing.md }}
          >
            {t("oneTimePayment")}
          </Text>
        </View>

        {error ? (
          <Text
            variant="caption"
            tone="danger"
            align="center"
            style={{ marginTop: spacing.base }}
          >
            {error}
          </Text>
        ) : null}

        {restoreNotice ? (
          <Text
            accessibilityRole="alert"
            variant="caption"
            tone="muted"
            align="center"
            style={{ marginTop: spacing.base }}
          >
            {restoreNotice}
          </Text>
        ) : null}

        <Button
          label={t("restorePurchases")}
          variant="ghost"
          fullWidth
          onPress={() => {
            setRestoreNotice(null);
            void restore().then((outcome) => {
              if (outcome === "none") setRestoreNotice(t("noPriorPurchases"));
            });
          }}
          style={{ marginTop: spacing.lg }}
        />

        <Text
          variant="micro"
          tone="faint"
          align="center"
          style={{ marginTop: spacing.xl }}
        >
          {t("adsDisclosure")}
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: spacing.lg,
            marginTop: spacing.md,
          }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("termsOfUse")}
            hitSlop={12}
            onPress={() => void Linking.openURL(TERMS_URL)}
          >
            <Text variant="micro" tone="faint">
              {t("termsOfUse")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("privacyPolicy")}
            hitSlop={12}
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <Text variant="micro" tone="faint">
              {t("privacyPolicy")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
