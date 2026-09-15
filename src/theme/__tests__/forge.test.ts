import { FORGE_THEMES, FORGE_THEME_NAMES, forgeTheme } from '../forge';
import { contrastRatio } from '../color';

describe('every forge theme is legible', () => {
  for (const [name, theme] of Object.entries(FORGE_THEMES)) {
    // The balance sits on the anvil and is the number the whole game is about.
    it(`${name}: ink clears AA on the anvil`, () => {
      expect(contrastRatio(theme.ink, theme.anvil)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: the glow reads against the anvil`, () => {
      expect(contrastRatio(theme.glow, theme.anvil)).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: sparks are visible, not lost in the glow`, () => {
      expect(contrastRatio(theme.spark, theme.anvil)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('forgeTheme', () => {
  it('falls back to the default rather than throwing', () => {
    expect(forgeTheme('chartreuse')).toEqual(FORGE_THEMES.default);
  });

  it('names every theme it holds', () => {
    expect(FORGE_THEME_NAMES).toHaveLength(Object.keys(FORGE_THEMES).length);
  });
});
