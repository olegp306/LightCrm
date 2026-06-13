import type { Theme } from "@glideapps/glide-data-grid";

export const lightTableTheme: Partial<Theme> = {
  headerFontStyle: "600 12px",
  bgCell: "#ffffff",
  bgCellMedium: "#f7f8fb",
  bgHeader: "#f7f8fb",
  bgHeaderHasFocus: "#eef2f7",
  bgHeaderHovered: "#eef2f7",
  bgBubble: "#ffffff",
  borderColor: "#d9dee8",
  horizontalBorderColor: "#e5e7ee",
  textDark: "#172033",
  textMedium: "#667085",
  textHeader: "#344054",
  textHeaderSelected: "#ffffff",
  bgIconHeader: "#667085",
  accentColor: "#6d63ff",
  accentFg: "#ffffff",
  accentLight: "#ebe9ff"
};

export const darkTableTheme: Partial<Theme> = {
  headerFontStyle: "600 12px",
  bgCell: "#1f1f24",
  bgCellMedium: "#24242a",
  bgHeader: "#222228",
  bgHeaderHasFocus: "#2f3048",
  bgHeaderHovered: "#30303a",
  bgBubble: "#2a2a31",
  borderColor: "#3a3a45",
  horizontalBorderColor: "#34343d",
  textDark: "#f4f5f8",
  textMedium: "#b6bac8",
  textHeader: "#d9dbe5",
  textHeaderSelected: "#ffffff",
  bgIconHeader: "#8e93a6",
  accentColor: "#5a5fbe",
  accentFg: "#ffffff",
  accentLight: "#323257"
};

export function scaledTableTheme(theme: Partial<Theme>, scale: number): Partial<Theme> {
  const cellFontSize = Math.round(13 * scale);
  const headerFontSize = Math.round(12 * scale);
  return {
    ...theme,
    baseFontStyle: `${cellFontSize}px`,
    editorFontSize: `${cellFontSize}px`,
    headerFontStyle: `600 ${headerFontSize}px`
  };
}
