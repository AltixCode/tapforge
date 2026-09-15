/**
 * Forge themes: the anvil surface and the glow of the metal being worked.
 *
 * In `src/theme/` because every colour literal in the app is, and so the contrast test can
 * see them. `default` is free; the rest are what the paywall means by "every forge theme".
 * Every pairing is asserted at 4.5:1 by `__tests__/forge.test.ts`.
 */

export interface ForgeTheme {
  /** The tap surface. */
  anvil: string;
  /** The hot metal, and the tap ripple. */
  glow: string;
  /** Text and numerals drawn on `anvil`. */
  ink: string;
  /** The sparks that fly on a tap. */
  spark: string;
}

export const FORGE_THEMES: Record<string, ForgeTheme> = {
  default: { anvil: '#2B2B31', glow: '#F97316', ink: '#F8FAFC', spark: '#FDE68A' },
  ember: { anvil: '#3B1206', glow: '#EF4444', ink: '#FEF2F2', spark: '#FCA5A5' },
  frost: { anvil: '#0C2A3A', glow: '#38BDF8', ink: '#F0F9FF', spark: '#BAE6FD' },
  verdant: { anvil: '#122A16', glow: '#4ADE80', ink: '#F0FDF4', spark: '#BBF7D0' },
};

export const FORGE_THEME_NAMES = Object.keys(FORGE_THEMES);

export function forgeTheme(name: string): ForgeTheme {
  return FORGE_THEMES[name] ?? FORGE_THEMES.default!;
}
