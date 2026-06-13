import { describe, expect, it } from "vitest";
import { darkTableTheme, scaledTableTheme } from "./table-theme";

function rgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("table theme", () => {
  it("keeps dark selected and focused column headers readable", () => {
    const theme = scaledTableTheme(darkTableTheme, 1);

    expect(theme.bgHeaderHasFocus).toBeDefined();
    expect(relativeLuminance(theme.bgHeaderHasFocus!)).toBeLessThan(0.18);
    expect(contrastRatio(theme.textHeader!, theme.bgHeaderHasFocus!)).toBeGreaterThan(4.5);
    expect(contrastRatio(theme.textHeaderSelected!, theme.accentColor!)).toBeGreaterThan(4.5);
  });
});
