"use client";

import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  GridCellKind,
  CompactSelection,
  type CustomCell,
  type CustomRenderer,
  type DataEditorRef,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type GridSelection,
  type Item,
  type Theme
} from "@glideapps/glide-data-grid";
import { Check, Columns3, Download, FileText, Italic, Merge, Palette, Plus, Search, Trash2, X } from "lucide-react";
import type { ChangeEvent, ComponentProps, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyTablePreferences,
  buildCreateRecordPayload,
  compactDocumentTitle,
  documentExtensionLabel,
  formatAreaValue,
  nextActionStateForTodo,
  recordToRow,
  sortRows,
  toCsv,
  updateRowCell,
  type ApiRecord,
  type ColumnTextStyle,
  type CreateRecordFieldValue,
  type CreateRecordPayloadConfig,
  type TablePreferences,
  type TableSort
} from "./table-model";

type DrawCellArgs = Parameters<NonNullable<ComponentProps<typeof DataEditor>["drawCell"]>>[0];

export type CrmTableColumn = {
  id: string;
  title: string;
  width?: number;
  defaultVisible?: boolean;
  mobilePriority?: number;
  group?: string;
  valueKind?: "text" | "link" | "documents" | "calendar" | "area" | "longText" | "action";
  textStyle?: ColumnTextStyle;
};

export type DocumentCellItem = {
  id: string;
  fileName: string;
  shortSummary: string;
  longSummary: string | null;
  downloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt?: string | null;
};

export type DocumentCellValue = DocumentCellItem[];
export type CalendarCellItem = {
  id: string;
  kind: "reminder" | "event";
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
  sourceChannel: string | null;
};

export type CalendarCellValue = CalendarCellItem[];

export type CrmTableCellValue = string | number | null | DocumentCellValue | CalendarCellValue;

export type CrmTableRow = {
  id: string;
  values: Record<string, CrmTableCellValue>;
};

export type CreateRecordField = {
  id: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
};

export type CreateRecordConfig = CreateRecordPayloadConfig & {
  endpoint: string;
  fields: CreateRecordField[];
};

export type ClientOption = {
  id: string;
  code?: string | null;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

export type ArchiveRecordEntity = "client" | "lead" | "coldTarget" | "reminder" | "calendarEvent" | "documentFile" | "leadSummary";

export type CrmTableProps = {
  title: string;
  description: string;
  columns: CrmTableColumn[];
  rows: CrmTableRow[];
  tableKey?: string;
  initialFocusRowId?: string | null;
  documentUploadEndpoint?: string;
  leadSummariesEndpoint?: string;
  updateRecordEndpoint?: string;
  offerGenerateEndpoint?: string;
  clientOptionsEndpoint?: string;
  archiveEntity?: ArchiveRecordEntity;
  createRecord?: CreateRecordConfig;
};

type DocumentsCustomCell = CustomCell<{
  kind: "documents-cell";
  documents: DocumentCellValue;
  uploadPulse: number;
  uploadingCount: number;
}>;

type CalendarCustomCell = CustomCell<{
  kind: "calendar-cell";
  items: CalendarCellValue;
}>;

type DocumentCellAction = { type: "open"; index: number } | { type: "upload" } | null;
type CalendarCellAction = { type: "delete"; index: number } | null;
type CellDeleteTarget =
  | { kind: "document"; rowId: string; item: DocumentCellItem }
  | { kind: "calendar"; rowId: string; item: CalendarCellItem };
type DocumentUploadTarget = {
  rowId: string;
  files: File[];
};

type LeadSummaryHistoryItem = {
  id: string;
  leadId: string;
  shortSummary: string;
  longSummary: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

type LeadSummaryHistoryResponse = {
  leadId: string;
  latest: LeadSummaryHistoryItem | null;
  summaries: LeadSummaryHistoryItem[];
};

type LeadSummaryHistoryTarget = {
  row: CrmTableRow;
  loading: boolean;
  error: string | null;
  summaries: LeadSummaryHistoryItem[];
};

type LongTextPreview = {
  title: string;
  text: string;
};

type BulkActionDialog = "delete" | "merge" | null;

type MobileEditTarget = {
  rowId: string;
  columnId: string;
  value: string;
  saving: boolean;
};

type DetailsPanelState = {
  rowId: string;
  values: Record<string, string>;
  saving: boolean;
};

type DetailsPanelTab = "details" | "documents";

type DetailsButtonPosition = {
  left: number;
  top: number;
};

type ClientPickerState = {
  rowId: string;
  left: number;
  top: number;
  query: string;
  saving: boolean;
  error: string | null;
};

type LeadSummaryDraft = {
  shortSummary: string;
  longSummary: string;
  saving: boolean;
};

function defaultPreferences(columns: CrmTableColumn[]): TablePreferences {
  return {
    order: columns.map((column) => column.id),
    widths: Object.fromEntries(columns.map((column) => [column.id, column.width ?? 160])),
    hidden: columns.filter((column) => column.defaultVisible === false).map((column) => column.id),
    tableColor: defaultTableColor
  };
}

function nextSort(current: TableSort | null, columnId: string): TableSort | null {
  if (current?.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  return null;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openTableLink(href: string) {
  if (!href) {
    return;
  }
  if (href.startsWith("/")) {
    window.location.assign(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

const defaultTableColor = "#4da377";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "").trim();
  const value = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed) || value.length !== 6) {
    return { r: 77, g: 163, b: 119 };
  }
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function contrastTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? "#1f3329" : "#f7fffb";
}

function relatedTableHeaderTheme(color: string, isDarkMode: boolean): Partial<Theme> {
  return {
    bgHeader: colorWithAlpha(color, isDarkMode ? 0.18 : 0.16),
    bgHeaderHovered: colorWithAlpha(color, isDarkMode ? 0.28 : 0.22),
    textGroupHeader: isDarkMode ? colorWithAlpha(color, 0.95) : colorWithAlpha(color, 0.98),
    textHeader: isDarkMode ? "#e8f5ef" : "#24352d"
  };
}

const groupHeaderHeight = 20;
const rowMarkerWidth = 34;
const lightTableTheme: Partial<Theme> = {
  headerFontStyle: "600 12px",
  bgCell: "#ffffff",
  bgCellMedium: "#f7f8fb",
  bgHeader: "#f7f8fb",
  bgHeaderHovered: "#eef2f7",
  bgBubble: "#ffffff",
  borderColor: "#d9dee8",
  horizontalBorderColor: "#e5e7ee",
  textDark: "#172033",
  textMedium: "#667085",
  textHeader: "#344054",
  bgIconHeader: "#667085",
  accentColor: "#6d63ff",
  accentLight: "#ebe9ff"
};

const darkTableTheme: Partial<Theme> = {
  headerFontStyle: "600 12px",
  bgCell: "#1f1f24",
  bgCellMedium: "#24242a",
  bgHeader: "#222228",
  bgHeaderHovered: "#30303a",
  bgBubble: "#2a2a31",
  borderColor: "#3a3a45",
  horizontalBorderColor: "#34343d",
  textDark: "#f4f5f8",
  textMedium: "#b6bac8",
  textHeader: "#d9dbe5",
  bgIconHeader: "#8e93a6",
  accentColor: "#8b8cff",
  accentLight: "#323257"
};

const documentChipWidth = 106;
const documentIconChipWidth = 26;
const documentChipGap = 1;
const documentChipHeight = 24;
const documentIconWidth = 18;
const documentIconHeight = 18;
const documentUploadInset = 8;
const documentUploadHitWidth = 40;
const documentUploadPlusSize = 12;
const cellDeleteHitSize = 14;
const calendarChipWidth = 112;
const calendarChipHeight = 28;
const calendarChipGap = 3;
const calendarDateOnlyWidth = 46;
const calendarTitleMaxLength = 12;
const clientPickerHitSize = 24;
const tableFontScales = [1, 1.2, 1.4] as const;

function documentChipDisplayWidth(documents: DocumentCellValue): number {
  return documents.length > 3 ? documentIconChipWidth : documentChipWidth;
}

function isClientPickerHit(localX: number, localY: number, width: number, height: number): boolean {
  return localX >= width - clientPickerHitSize - 14 && localX <= width - 2 && localY >= 2 && localY <= height - 2;
}

function normalizedFontScale(value: number | undefined): (typeof tableFontScales)[number] {
  return tableFontScales.find((scale) => Math.abs(scale - (value ?? 1)) < 0.01) ?? 1;
}

function nextFontScale(value: number | undefined): (typeof tableFontScales)[number] {
  const currentScale = normalizedFontScale(value);
  const currentIndex = tableFontScales.indexOf(currentScale);
  return tableFontScales[(currentIndex + 1) % tableFontScales.length];
}

function tableFontLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

function tableFontIcon(scale: number): string {
  if (scale >= 1.39) {
    return "A+";
  }
  if (scale >= 1.19) {
    return "A";
  }
  return "a";
}

function selectedRowIndexes(selection: GridSelection, rowCount: number): number[] {
  return selection.rows.toArray().filter((index) => index >= 0 && index < rowCount);
}

function selectedColumnIndexes(selection: GridSelection, columnCount: number): number[] {
  return selection.columns.toArray().filter((index) => index >= 0 && index < columnCount);
}

function rowPublicRef(row: CrmTableRow): string {
  const code = row.values.code;
  return typeof code === "string" && code.trim() ? code.trim() : row.id;
}

function rowSelection(indexes: number[]): GridSelection {
  const uniqueIndexes = Array.from(new Set(indexes)).sort((left, right) => left - right);
  return {
    columns: CompactSelection.empty(),
    rows: uniqueIndexes.reduce((selection, index) => selection.add(index), CompactSelection.empty())
  };
}

function columnSelection(index: number): GridSelection {
  return {
    columns: CompactSelection.empty().add(index),
    rows: CompactSelection.empty()
  };
}

function readSavedTableColor(key: string): string {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) {
      return defaultTableColor;
    }
    const parsed = JSON.parse(saved) as TablePreferences;
    return parsed.tableColor ?? defaultTableColor;
  } catch {
    return defaultTableColor;
  }
}

function scaledTableTheme(theme: Partial<Theme>, scale: number): Partial<Theme> {
  const cellFontSize = Math.round(13 * scale);
  const headerFontSize = Math.round(12 * scale);
  return {
    ...theme,
    baseFontStyle: `${cellFontSize}px`,
    editorFontSize: `${cellFontSize}px`,
    headerFontStyle: `600 ${headerFontSize}px`
  };
}

function columnFontStyle(baseTheme: Partial<Theme>, textStyle?: ColumnTextStyle): string | undefined {
  const weight = textStyle?.weight ?? (textStyle?.bold ? "super" : undefined);
  if (!weight && !textStyle?.italic) {
    return undefined;
  }
  const fontSize = fontSizeFromTheme(baseTheme, 13);
  const fontWeight = weight === "super" ? "700 " : weight === "medium" ? "600 " : "";
  return `${textStyle?.italic ? "italic " : ""}${fontWeight}${fontSize}px`.trim();
}

function nextColumnWeight(weight: ColumnTextStyle["weight"] | undefined): ColumnTextStyle["weight"] | undefined {
  if (!weight) {
    return "medium";
  }
  if (weight === "medium") {
    return "super";
  }
  return undefined;
}

function columnWeightLabel(weight: ColumnTextStyle["weight"] | undefined): string {
  if (weight === "super") {
    return "super";
  }
  if (weight === "medium") {
    return "medium";
  }
  return "normal";
}

function textThemeOverride(baseTheme: Partial<Theme>, rowTheme: Partial<Theme> | undefined, textStyle?: ColumnTextStyle): Partial<Theme> | undefined {
  const baseFontStyle = columnFontStyle(baseTheme, textStyle);
  if (!baseFontStyle) {
    return rowTheme;
  }
  return { ...(rowTheme ?? {}), baseFontStyle };
}

function fontSizeFromTheme(theme: { baseFontStyle?: string }, fallback: number): number {
  const fontSize = Number.parseFloat(theme.baseFontStyle ?? "");
  return Number.isFinite(fontSize) ? fontSize : fallback;
}

function drawSearchMatchHighlight(args: DrawCellArgs, query: string, isDarkMode: boolean): void {
  const needle = query.trim();
  if (!needle || args.row < 0 || args.cell.kind !== GridCellKind.Text) {
    return;
  }

  const text = args.cell.displayData ?? args.cell.data;
  if (!text) {
    return;
  }

  const normalizedText = text.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedNeedle);
  if (matchIndex < 0) {
    return;
  }

  const { ctx, rect, theme } = args;
  const matchText = text.slice(matchIndex, matchIndex + needle.length);
  const beforeText = text.slice(0, matchIndex);
  const fontSize = fontSizeFromTheme(theme, 13);
  const padding = theme.cellHorizontalPadding ?? 8;
  const fontFamily = theme.fontFamily ?? "Inter, sans-serif";
  const cellFont = `${theme.baseFontStyle ?? `${fontSize}px`} ${fontFamily}`;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + 2, rect.y + 1, rect.width - 4, rect.height - 2);
  ctx.clip();
  ctx.font = cellFont;
  ctx.textBaseline = "middle";

  const fullWidth = ctx.measureText(text).width;
  const beforeWidth = ctx.measureText(beforeText).width;
  const matchWidth = ctx.measureText(matchText).width;
  const align = args.cell.contentAlign ?? "left";
  const textStart =
    align === "right"
      ? rect.x + rect.width - padding - fullWidth
      : align === "center"
        ? rect.x + rect.width / 2 - fullWidth / 2
        : rect.x + padding;

  const x = textStart + beforeWidth;
  const maxX = rect.x + rect.width - 4;
  if (x >= maxX || x + matchWidth <= rect.x + 4) {
    ctx.restore();
    return;
  }

  const highlightHeight = Math.max(16, Math.min(rect.height - 6, fontSize + 6));
  const highlightX = Math.max(rect.x + 3, x - 2);
  const highlightY = rect.y + (rect.height - highlightHeight) / 2;
  const highlightWidth = Math.min(matchWidth + 4, maxX - highlightX);

  ctx.fillStyle = isDarkMode ? "rgba(154, 140, 255, 0.34)" : "rgba(124, 91, 255, 0.18)";
  ctx.beginPath();
  ctx.roundRect(highlightX, highlightY, highlightWidth, highlightHeight, 4);
  ctx.fill();

  ctx.fillStyle = theme.textDark;
  ctx.fillText(matchText, x, rect.y + rect.height / 2);
  ctx.restore();
}

function emptySelection(): GridSelection {
  return {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty()
  };
}

function cellSelection(cell: Item): GridSelection {
  return {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: {
      cell,
      range: { x: cell[0], y: cell[1], width: 1, height: 1 },
      rangeStack: []
    }
  };
}

function pointInRect(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function documentCellActionAt(x: number, y: number, documents: DocumentCellValue, uploadStart: number): DocumentCellAction {
  if (x >= uploadStart) {
    return { type: "upload" };
  }
  const chipWidth = documentChipDisplayWidth(documents);
  const index = Math.floor(x / (chipWidth + documentChipGap));
  const chipStart = index * (chipWidth + documentChipGap);
  if (index >= 0 && index < documents.length && x >= chipStart && x <= chipStart + chipWidth) {
    return { type: "open", index };
  }
  return null;
}

function calendarCellActionAt(x: number, y: number, items: CalendarCellValue, availableWidth: number): CalendarCellAction {
  const firstItems = items.slice(0, 3);
  const fullChipWidth = firstItems.length * calendarChipWidth + Math.max(0, firstItems.length - 1) * calendarChipGap;
  const dateOnlyMode = items.length > 3 || fullChipWidth > availableWidth;
  const chipWidth = dateOnlyMode ? calendarDateOnlyWidth : calendarChipWidth;
  const visibleItemLimit = Math.max(1, Math.floor((availableWidth + calendarChipGap) / (chipWidth + calendarChipGap)));
  const visibleItems = (dateOnlyMode ? items : firstItems).slice(0, visibleItemLimit);
  for (let index = 0; index < visibleItems.length; index += 1) {
    const chipStart = index * (chipWidth + calendarChipGap);
    if (pointInRect(x, y, { left: chipStart + chipWidth - cellDeleteHitSize, top: 0, width: cellDeleteHitSize, height: cellDeleteHitSize })) {
      const item = visibleItems[index];
      const originalIndex = items.findIndex((candidate) => candidate.id === item?.id && candidate.kind === item?.kind);
      return originalIndex >= 0 ? { type: "delete", index: originalIndex } : null;
    }
  }
  return null;
}

function documentCellDisplayData(documents: DocumentCellValue): string {
  return documents.map((document) => document.fileName).join(", ");
}

function drawMiniDeleteIcon(ctx: CanvasRenderingContext2D, x: number, y: number, hovered: boolean, theme: Theme): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, cellDeleteHitSize - 2, cellDeleteHitSize - 2, 4);
  ctx.fillStyle = hovered ? "rgba(180, 35, 24, 0.16)" : "rgba(102, 112, 133, 0.1)";
  ctx.fill();
  ctx.strokeStyle = hovered ? "#b42318" : theme.borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = hovered ? "#b42318" : theme.textMedium;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + cellDeleteHitSize - 6, y + cellDeleteHitSize - 6);
  ctx.moveTo(x + cellDeleteHitSize - 6, y + 4);
  ctx.lineTo(x + 4, y + cellDeleteHitSize - 6);
  ctx.stroke();
  ctx.restore();
}

function isDocumentCellItem(value: unknown): value is DocumentCellItem {
  return Boolean(value && typeof value === "object" && "fileName" in value);
}

function isCalendarCellItem(value: unknown): value is CalendarCellItem {
  return Boolean(value && typeof value === "object" && "startsAt" in value && "title" in value);
}

function calendarTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function calendarDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function calendarDayMonthLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function compactCalendarTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= calendarTitleMaxLength ? normalized : `${normalized.slice(0, calendarTitleMaxLength)}...`;
}

function calendarCellDisplayData(items: CalendarCellValue): string {
  return items.map((item) => `${calendarDateLabel(item.startsAt)} ${calendarTimeLabel(item.startsAt)} ${item.title}`).join(", ");
}

function actionTone(value: CrmTableCellValue | undefined): { fill: string; stroke: string; dot: string; text: string } {
  const state = textCellValue(value)?.toLocaleLowerCase() ?? "";
  if (state === "crm") {
    return { fill: "rgba(65, 148, 111, 0.12)", stroke: "rgba(65, 148, 111, 0.34)", dot: "#2f9368", text: "#183d2e" };
  }
  if (state === "waiting") {
    return { fill: "rgba(196, 141, 45, 0.14)", stroke: "rgba(196, 141, 45, 0.34)", dot: "#b7791f", text: "#4d3514" };
  }
  if (state === "done") {
    return { fill: "rgba(118, 128, 144, 0.12)", stroke: "rgba(118, 128, 144, 0.28)", dot: "#788292", text: "#344054" };
  }
  return { fill: "rgba(96, 108, 128, 0.1)", stroke: "rgba(96, 108, 128, 0.24)", dot: "#667085", text: "#344054" };
}

function sortCalendarItemsByStart(items: CalendarCellValue): CalendarCellValue {
  return [...items].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function mobileCalendarTitle(item: CalendarCellItem): string {
  return `${calendarDateLabel(item.startsAt)} ${calendarTimeLabel(item.startsAt)} ${item.title}`;
}

function calendarDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarAddMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function calendarAddDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

function calendarMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function calendarMonthGrid(anchor: Date): Date[] {
  const monthStart = calendarMonthStart(anchor);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = calendarAddDays(monthStart, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => calendarAddDays(gridStart, index));
}

function nearestCalendarItem(items: CalendarCellValue): CalendarCellItem | null {
  const sorted = sortCalendarItemsByStart(items);
  const now = Date.now();
  return sorted.find((item) => {
    const date = calendarDate(item.startsAt);
    return date ? date.getTime() >= now : false;
  }) ?? sorted[0] ?? null;
}

function calendarItemsByDay(items: CalendarCellValue): Map<string, CalendarCellValue> {
  const byDay = new Map<string, CalendarCellValue>();
  items.forEach((item) => {
    const date = calendarDate(item.startsAt);
    if (!date) {
      return;
    }
    const key = calendarDayKey(date);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  });
  return byDay;
}

function cellDocuments(value: CrmTableCellValue | undefined): DocumentCellValue {
  return Array.isArray(value) && value.every(isDocumentCellItem) ? value : [];
}

function sortDocumentsByAdded(documents: DocumentCellValue): DocumentCellValue {
  return [...documents].sort((left, right) => {
    const parsedLeftTime = left.createdAt ? new Date(left.createdAt).getTime() : Number.NaN;
    const parsedRightTime = right.createdAt ? new Date(right.createdAt).getTime() : Number.NaN;
    const leftTime = Number.isFinite(parsedLeftTime) ? parsedLeftTime : Number.POSITIVE_INFINITY;
    const rightTime = Number.isFinite(parsedRightTime) ? parsedRightTime : Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.fileName.localeCompare(right.fileName);
  });
}

function cellCalendarItems(value: CrmTableCellValue | undefined): CalendarCellValue {
  return Array.isArray(value) && value.every(isCalendarCellItem) ? value : [];
}

function currentColorTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function useDarkModeEnabled(): boolean {
  const [theme, setTheme] = useState<"light" | "dark">(() => currentColorTheme());

  useEffect(() => {
    const updateTheme = () => setTheme(currentColorTheme());
    updateTheme();
    window.addEventListener("lightcrm:theme-change", updateTheme);
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("lightcrm:theme-change", updateTheme);
      observer.disconnect();
    };
  }, []);

  return theme === "dark";
}

function mobileDisplayValue(value: CrmTableCellValue | undefined): string | number {
  if (Array.isArray(value)) {
    if (value.every(isDocumentCellItem)) {
      return value.length > 0 ? value.map((item) => compactDocumentTitle(item.fileName)).join(", ") : "n/a";
    }
    if (value.every(isCalendarCellItem)) {
      return value.length > 0 ? calendarCellDisplayData(value) : "n/a";
    }
    return "n/a";
  }
  return value ?? "n/a";
}

function textCellValue(value: CrmTableCellValue | undefined): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function mobileLeadSummary(row: CrmTableRow): { short: string; long: string | null; updatedAt: string | null } | null {
  const short = textCellValue(row.values.summaryShort);
  if (!short) {
    return null;
  }
  const long = textCellValue(row.values.summaryLong);
  return {
    short,
    long: long && long !== short ? long : null,
    updatedAt: textCellValue(row.values.summaryUpdatedAt)
  };
}

function offerMissingFieldChips(value: CrmTableCellValue | undefined): string[] {
  const text = textCellValue(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const mobileReadonlyColumnIds = new Set([
  "code",
  "nextAction",
  "nextActionState",
  "client.name",
  "client.phone",
  "client.email",
  "calendar",
  "documents",
  "offerStatus",
  "offerTotalGross",
  "offerMissingFields",
  "summaryShort",
  "summaryLong",
  "summaryUpdatedAt"
]);

function isMobileEditableColumn(column: CrmTableColumn): boolean {
  return !mobileReadonlyColumnIds.has(column.id) && column.valueKind !== "documents" && column.valueKind !== "calendar";
}

function isMobileMultilineColumn(columnId: string): boolean {
  return ["description", "todo", "address", "notes", "rawInput"].includes(columnId);
}

function documentChipTitle(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base.length <= 10 ? base : `${base.slice(0, 10)}...`;
}

function formatDocumentCreatedAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function documentBadgeColor(extension: string): string {
  if (extension === "PDF") {
    return "#8f4a45";
  }
  if (extension === "XLS") {
    return "#4f7a5f";
  }
  if (extension === "IMG") {
    return "#566f9f";
  }
  if (extension === "AUD") {
    return "#75649a";
  }
  if (extension === "DOC") {
    return "#4f6694";
  }
  return "#667085";
}

const documentCellRenderer: CustomRenderer<DocumentsCustomCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is DocumentsCustomCell =>
    cell.data && typeof cell.data === "object" && "kind" in cell.data && cell.data.kind === "documents-cell",
  needsHover: true,
  needsHoverPosition: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverAmount, hoverX } = args;
    const documents = cell.data.documents;
    const compactDocuments = documents.length > 3;
    const chipWidth = documentChipDisplayWidth(documents);
    const top = rect.y + Math.floor((rect.height - documentChipHeight) / 2);
    const canvasWidth = ctx.canvas.getBoundingClientRect().width;
    const visibleRight = Math.min(rect.x + rect.width, canvasWidth);
    const uploadHitLeft = Math.max(rect.x + 8, visibleRight - documentUploadHitWidth - documentUploadInset);
    const uploadStart = uploadHitLeft - rect.x - 8;
    let left = rect.x + 8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    const localX = hoverX === undefined ? -1 : hoverX <= rect.width ? hoverX - 8 : hoverX - rect.x - 8;
    const localY =
      args.hoverY === undefined ? -1 : args.hoverY <= rect.height ? args.hoverY - (top - rect.y) : args.hoverY - top;
    const hoveredAction = documentCellActionAt(localX, localY, documents, uploadStart);
    const uploadHovered = hoveredAction?.type === "upload";
    if (hoverAmount > 0) {
      ctx.globalAlpha = hoverAmount;
      ctx.beginPath();
      ctx.rect(rect.x + 1, rect.y + 1, rect.width, rect.height - 2);
      ctx.fillStyle = uploadHovered ? theme.accentLight : theme.bgHeaderHovered;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const [index, document] of documents.entries()) {
      const hovered = hoveredAction?.type === "open" && hoveredAction.index === index;
      const extension = documentExtensionLabel(document.fileName, document.mimeType);
      ctx.fillStyle = hovered ? theme.bgHeaderHovered : theme.bgBubble;
      ctx.strokeStyle = hovered ? theme.accentColor : theme.borderColor;
      ctx.lineWidth = hovered ? 1.15 : 0.85;
      ctx.beginPath();
      ctx.roundRect(left, top, chipWidth, documentChipHeight, 7);
      ctx.fill();
      ctx.stroke();

      const iconLeft = left + 4;
      const iconTop = top + Math.floor((documentChipHeight - documentIconHeight) / 2);
      ctx.fillStyle = documentBadgeColor(extension);
      ctx.beginPath();
      ctx.roundRect(iconLeft, iconTop, documentIconWidth, documentIconHeight, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 8px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(extension.slice(0, 3), iconLeft + documentIconWidth / 2, iconTop + documentIconHeight / 2);

      ctx.fillStyle = theme.textDark;
      ctx.font = `500 ${Math.max(12, fontSizeFromTheme(theme, 13) - 1)}px Inter, sans-serif`;
      ctx.textAlign = "left";
      if (!compactDocuments) {
        const titleLeft = iconLeft + documentIconWidth + 6;
        ctx.fillText(documentChipTitle(document.fileName), titleLeft, top + documentChipHeight / 2, chipWidth - (titleLeft - left) - 17);
      }
      left += chipWidth + documentChipGap;
    }

    if (cell.data.uploadingCount > 0) {
      const spinnerCenterX = visibleRight - documentUploadInset - documentUploadPlusSize * 0.5;
      const spinnerCenterY = rect.y + rect.height / 2;
      const spinnerRadius = 7;
      const start = cell.data.uploadPulse * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(spinnerCenterX, spinnerCenterY, spinnerRadius, start, start + Math.PI * 1.45);
      ctx.strokeStyle = theme.accentColor;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();
      if (cell.data.uploadingCount > 1) {
        ctx.fillStyle = theme.accentColor;
        ctx.font = "700 8px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cell.data.uploadingCount), spinnerCenterX, spinnerCenterY);
      }
    } else if (hoverAmount > 0) {
      const lineSize = hoverAmount * documentUploadPlusSize;
      const xTranslate = (1 - hoverAmount) * documentUploadPlusSize * 0.5;
      const plusCenterX = visibleRight - documentUploadInset - documentUploadPlusSize * 0.5 - xTranslate;
      const plusCenterY = rect.y + rect.height / 2;
      if (lineSize > 0) {
        ctx.beginPath();
        ctx.moveTo(plusCenterX - lineSize * 0.5, plusCenterY);
        ctx.lineTo(plusCenterX + lineSize * 0.5, plusCenterY);
        ctx.moveTo(plusCenterX, plusCenterY - lineSize * 0.5);
        ctx.lineTo(plusCenterX, plusCenterY + lineSize * 0.5);
        ctx.lineWidth = uploadHovered ? 2.2 : 2;
        ctx.strokeStyle = uploadHovered ? theme.accentColor : theme.bgIconHeader;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
    ctx.restore();
  },
  onPaste: (_value, cellData) => cellData
};

const calendarCellRenderer: CustomRenderer<CalendarCustomCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is CalendarCustomCell =>
    cell.data && typeof cell.data === "object" && "kind" in cell.data && cell.data.kind === "calendar-cell",
  needsHover: true,
  needsHoverPosition: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverAmount, hoverX } = args;
    const items = cell.data.items.slice(0, 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    if (hoverAmount > 0) {
      ctx.globalAlpha = hoverAmount;
      ctx.fillStyle = theme.bgHeaderHovered;
      ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
      ctx.globalAlpha = 1;
    }
    if (items.length === 0) {
      ctx.fillStyle = theme.textMedium;
      ctx.font = `500 ${Math.max(12, fontSizeFromTheme(theme, 13) - 1)}px Inter, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("No events", rect.x + 10, rect.y + rect.height / 2);
      ctx.restore();
      return;
    }
    let left = rect.x + 8;
    const top = rect.y + Math.floor((rect.height - calendarChipHeight) / 2);
    const visibleRight = Math.min(rect.x + rect.width - 8, ctx.canvas.getBoundingClientRect().width);
    const availableWidth = Math.max(0, visibleRight - left);
    const fullChipWidth = items.length * calendarChipWidth + Math.max(0, items.length - 1) * calendarChipGap;
    const dateOnlyMode = cell.data.items.length > 3 || fullChipWidth > availableWidth;
    const drawItems = dateOnlyMode ? cell.data.items : items;
    const chipWidth = dateOnlyMode ? calendarDateOnlyWidth : calendarChipWidth;
    const visibleItemLimit = Math.max(1, Math.floor((availableWidth + calendarChipGap) / (chipWidth + calendarChipGap)));
    const localX = hoverX === undefined ? -1 : hoverX <= rect.width ? hoverX - 8 : hoverX - rect.x - 8;
    const localY =
      args.hoverY === undefined ? -1 : args.hoverY <= rect.height ? args.hoverY - (top - rect.y) : args.hoverY - top;
    const hoveredAction = calendarCellActionAt(localX, localY, cell.data.items, availableWidth);
    for (const item of drawItems.slice(0, visibleItemLimit)) {
      if (left + chipWidth > visibleRight) {
        break;
      }
      const originalIndex = cell.data.items.findIndex((candidate) => candidate.id === item.id && candidate.kind === item.kind);
      const deleteHovered = hoveredAction?.type === "delete" && hoveredAction.index === originalIndex;
      const itemBorderColor = item.kind === "reminder" ? "#b98a55" : "#8b8fc8";
      ctx.fillStyle = theme.bgBubble;
      ctx.strokeStyle = deleteHovered ? "#b42318" : itemBorderColor;
      ctx.lineWidth = deleteHovered ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.roundRect(left, top, chipWidth, calendarChipHeight, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = theme.textDark;
      ctx.font = "600 9px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      if (dateOnlyMode) {
        ctx.textAlign = "center";
        ctx.fillText(calendarDayMonthLabel(item.startsAt), left + chipWidth / 2, top + 9, chipWidth - 6);
        ctx.fillStyle = theme.textMedium;
        ctx.font = "500 9px Inter, sans-serif";
        ctx.fillText(calendarTimeLabel(item.startsAt), left + chipWidth / 2, top + 20, chipWidth - 6);
      } else {
        ctx.fillText(calendarDayMonthLabel(item.startsAt), left + 7, top + 9, 36);
        ctx.fillStyle = theme.textMedium;
        ctx.font = "500 9px Inter, sans-serif";
        ctx.fillText(calendarTimeLabel(item.startsAt), left + 7, top + 20, 36);
        ctx.fillStyle = theme.textDark;
        ctx.font = `500 ${Math.max(11, fontSizeFromTheme(theme, 13) - 2)}px Inter, sans-serif`;
        ctx.fillText(compactCalendarTitle(item.title), left + 47, top + calendarChipHeight / 2, chipWidth - 68);
      }
      if (deleteHovered || (localX >= left - rect.x - 8 && localX <= left - rect.x - 8 + chipWidth)) {
        drawMiniDeleteIcon(ctx, left + chipWidth - cellDeleteHitSize, top + 2, deleteHovered, theme);
      }
      left += chipWidth + calendarChipGap;
    }
    const hiddenCount = cell.data.items.length - Math.min(cell.data.items.length, visibleItemLimit);
    if (hiddenCount > 0 && left + 30 <= visibleRight) {
      ctx.fillStyle = theme.textMedium;
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${hiddenCount}`, left + 2, rect.y + rect.height / 2);
    }
    ctx.restore();
  },
  onPaste: (_value, cellData) => cellData
};

export function CrmTable({
  title,
  description,
  columns,
  rows,
  tableKey = title.toLowerCase(),
  initialFocusRowId,
  documentUploadEndpoint,
  leadSummariesEndpoint,
  updateRecordEndpoint,
  offerGenerateEndpoint,
  clientOptionsEndpoint,
  archiveEntity,
  createRecord
}: CrmTableProps) {
  const [query, setQuery] = useState("");
  const gridRef = useRef<DataEditorRef | null>(null);
  const gridFrameRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `lightcrm.table.${tableKey}`;
  const [preferences, setPreferences] = useState<TablePreferences>(() => defaultPreferences(columns));
  const [loadedPreferencesKey, setLoadedPreferencesKey] = useState<string | null>(null);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection>(() => emptySelection());
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const lastMobileTapRef = useRef<{ key: string; at: number } | null>(null);
  const [editableRows, setEditableRows] = useState<CrmTableRow[]>(rows);
  const [draftRowIds, setDraftRowIds] = useState<Set<string>>(() => new Set());
  const [savingDraftIds, setSavingDraftIds] = useState<Set<string>>(() => new Set());
  const [flashRowId, setFlashRowId] = useState<string | null>(null);
  const [relatedTooltip, setRelatedTooltip] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);
  const [documentTooltip, setDocumentTooltip] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
    document: DocumentCellItem;
  } | null>(null);
  const [calendarTooltip, setCalendarTooltip] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
    items: CalendarCellValue;
  } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentCellItem | null>(null);
  const [cellDeleteTarget, setCellDeleteTarget] = useState<CellDeleteTarget | null>(null);
  const [isDeletingCellItem, setIsDeletingCellItem] = useState(false);
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTarget, setUploadTarget] = useState<DocumentUploadTarget | null>(null);
  const [uploadSummaries, setUploadSummaries] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDocumentUploads, setPendingDocumentUploads] = useState<Record<string, number>>({});
  const [uploadPulse, setUploadPulse] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingOffer, setIsGeneratingOffer] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [linkedTableColor, setLinkedTableColor] = useState(defaultTableColor);
  const [bulkActionDialog, setBulkActionDialog] = useState<BulkActionDialog>(null);
  const [mobileEditTarget, setMobileEditTarget] = useState<MobileEditTarget | null>(null);
  const [detailAnchorRowId, setDetailAnchorRowId] = useState<string | null>(null);
  const [detailsButtonPosition, setDetailsButtonPosition] = useState<DetailsButtonPosition | null>(null);
  const [clientPicker, setClientPicker] = useState<ClientPickerState | null>(null);
  const [hoveredClientPickerCell, setHoveredClientPickerCell] = useState<Item | null>(null);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [detailsPanel, setDetailsPanel] = useState<DetailsPanelState | null>(null);
  const [detailsPanelTab, setDetailsPanelTab] = useState<DetailsPanelTab>("details");
  const [summaryHistoryTarget, setSummaryHistoryTarget] = useState<LeadSummaryHistoryTarget | null>(null);
  const [leadSummaryDraft, setLeadSummaryDraft] = useState<LeadSummaryDraft>({ shortSummary: "", longSummary: "", saving: false });
  const [longTextPreview, setLongTextPreview] = useState<LongTextPreview | null>(null);
  const [archivingSummaryIds, setArchivingSummaryIds] = useState<Set<string>>(() => new Set());
  const [summaryArchiveConfirmId, setSummaryArchiveConfirmId] = useState<string | null>(null);
  const [copiedLeadCode, setCopiedLeadCode] = useState<string | null>(null);

  useEffect(() => {
    if (!showColumnMenu) {
      return;
    }
    function closeColumnMenuOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) {
        return;
      }
      setShowColumnMenu(false);
    }
    document.addEventListener("mousedown", closeColumnMenuOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeColumnMenuOnOutsideClick);
  }, [showColumnMenu]);
  const [mobileCalendarMonths, setMobileCalendarMonths] = useState<Record<string, string>>({});
  const mobileRowRefs = useRef(new Map<string, HTMLElement>());
  const isLeadTable = useMemo(
    () => columns.some((column) => column.id === "projectName") && columns.some((column) => column.id === "code"),
    [columns]
  );
  const isDarkMode = useDarkModeEnabled();
  const tableFontScale = normalizedFontScale(preferences.fontScale);
  const tableTooltipFontSize = Math.round(11 * tableFontScale);
  const tableTooltipStyle = useCallback(
    (left: number, top: number) =>
      ({
        left,
        top,
        "--table-tooltip-font-size": `${tableTooltipFontSize}px`
      }) as ComponentProps<"div">["style"],
    [tableTooltipFontSize]
  );
  const tableColor = preferences.tableColor ?? defaultTableColor;
  const activeTableTheme = useMemo(
    () => scaledTableTheme(isDarkMode ? darkTableTheme : lightTableTheme, tableFontScale),
    [isDarkMode, tableFontScale]
  );
  const activeRelatedTableHeaderTheme = useMemo(
    () => relatedTableHeaderTheme(linkedTableColor, isDarkMode),
    [isDarkMode, linkedTableColor]
  );
  const activeDraftRowTheme = {
    idle: isDarkMode
      ? {
          bgCell: "#2b281f",
          bgCellMedium: "#443a20",
          textDark: "#fff3ca",
          textMedium: "#e1c978"
        }
      : {
          bgCell: "#fffaf0",
          bgCellMedium: "#fff1bf",
          textDark: "#172033",
          textMedium: "#6f4e00"
        },
    flash: isDarkMode
      ? {
          bgCell: "#343021",
          bgCellMedium: "#443a20",
          textDark: "#fff3ca",
          textMedium: "#e1c978"
        }
      : {
          bgCell: "#fff7d6",
          bgCellMedium: "#fff1bf",
          textDark: "#172033",
          textMedium: "#6f4e00"
        }
  };

  useEffect(() => {
    setEditableRows(rows);
    setDraftRowIds(new Set());
    setSavingDraftIds(new Set());
    setFlashRowId(null);
  }, [rows]);

  useEffect(() => {
    const hasPendingUploads = Object.values(pendingDocumentUploads).some((count) => count > 0);
    if (!hasPendingUploads) {
      setUploadPulse(0);
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setUploadPulse((value) => (value + 0.08) % 1);
    }, 80);
    return () => window.clearInterval(intervalId);
  }, [pendingDocumentUploads]);

  useEffect(() => {
    setLoadedPreferencesKey(null);
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      setPreferences({ ...defaultPreferences(columns), ...(JSON.parse(saved) as TablePreferences) });
      setLoadedPreferencesKey(storageKey);
      return;
    }
    setPreferences(defaultPreferences(columns));
    setLoadedPreferencesKey(storageKey);
  }, [columns, storageKey]);

  useEffect(() => {
    if (loadedPreferencesKey !== storageKey) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [loadedPreferencesKey, preferences, storageKey]);

  useEffect(() => {
    if (tableKey === "clients") {
      setLinkedTableColor(tableColor);
      return;
    }
    setLinkedTableColor(readSavedTableColor("lightcrm.table.clients"));
  }, [tableColor, tableKey]);

  useEffect(() => {
    if (!clientOptionsEndpoint) {
      setClientOptions([]);
      return undefined;
    }
    const controller = new AbortController();
    fetch(clientOptionsEndpoint, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<ClientOption[]>) : []))
      .then((payload) => setClientOptions(Array.isArray(payload) ? payload : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setClientOptions([]);
        }
      });
    return () => controller.abort();
  }, [clientOptionsEndpoint]);

  const configuredColumns = useMemo(() => applyTablePreferences(columns, preferences), [columns, preferences]);
  const createTargetColumnIndex = useMemo(() => {
    if (!createRecord) {
      return 0;
    }
    const fieldIds = new Set(createRecord.fields.map((field) => field.id));
    const fieldColumnIndex = configuredColumns.findIndex(
      (column) => fieldIds.has(column.id) && column.valueKind !== "documents" && column.valueKind !== "link"
    );
    if (fieldColumnIndex >= 0) {
      return fieldColumnIndex;
    }
    const editableColumnIndex = configuredColumns.findIndex(
      (column) => column.valueKind !== "documents" && column.valueKind !== "link"
    );
    return Math.max(0, editableColumnIndex);
  }, [configuredColumns, createRecord]);
  const visibleColumns = useMemo<GridColumn[]>(
    () =>
      configuredColumns.map((column) => ({
        id: column.id,
        title: sort?.columnId === column.id ? `${column.title} ${sort.direction === "asc" ? "(asc)" : "(desc)"}` : column.title,
        width: column.width ?? 160,
        group: column.group,
        hasMenu: true,
        themeOverride: column.group === "Client" ? activeRelatedTableHeaderTheme : undefined
      })),
    [activeRelatedTableHeaderTheme, configuredColumns, sort]
  );
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const searchedRows = normalized
      ? editableRows.filter((row) =>
          Object.values(row.values).some((value) => String(value ?? "").toLowerCase().includes(normalized))
        )
      : editableRows;
    return sortRows(searchedRows, sort);
  }, [editableRows, query, sort]);

  useEffect(() => {
    if (!initialFocusRowId || filteredRows.length === 0 || configuredColumns.length === 0) {
      return;
    }
    const rowIndex = filteredRows.findIndex((row) => row.id === initialFocusRowId);
    if (rowIndex < 0) {
      return;
    }
    setFlashRowId(initialFocusRowId);
    gridRef.current?.scrollTo(createTargetColumnIndex, rowIndex);
    window.requestAnimationFrame(() => {
      mobileRowRefs.current.get(initialFocusRowId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timeout = window.setTimeout(() => setFlashRowId(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [configuredColumns.length, createTargetColumnIndex, filteredRows, initialFocusRowId]);

  const selectedIndexes = useMemo(() => selectedRowIndexes(gridSelection, filteredRows.length), [filteredRows.length, gridSelection]);
  const selectedRows = useMemo(
    () => selectedIndexes.flatMap((index) => (filteredRows[index] ? [filteredRows[index]] : [])),
    [filteredRows, selectedIndexes]
  );
  const currentCellRow = gridSelection.current?.cell[1] ?? null;
  const anchoredDetailRow = detailAnchorRowId ? filteredRows.find((row) => row.id === detailAnchorRowId) ?? null : null;
  const activeDetailRow = anchoredDetailRow
    ? anchoredDetailRow
    : currentCellRow !== null && filteredRows[currentCellRow]
      ? filteredRows[currentCellRow]
      : selectedRows.length === 1
      ? selectedRows[0]
      : null;
  const detailsEditableColumns = useMemo(
    () => configuredColumns.filter((column) => isMobileEditableColumn(column)),
    [configuredColumns]
  );
  const detailsPanelRow = detailsPanel ? editableRows.find((row) => row.id === detailsPanel.rowId) ?? null : null;
  const detailsPanelDocuments = detailsPanelRow ? sortDocumentsByAdded(cellDocuments(detailsPanelRow.values.documents)) : [];
  const selectedColumnIndex = useMemo(() => {
    const indexes = selectedColumnIndexes(gridSelection, configuredColumns.length);
    return indexes.length === 1 ? indexes[0] : null;
  }, [configuredColumns.length, gridSelection]);
  const selectedColumn = selectedColumnIndex !== null ? configuredColumns[selectedColumnIndex] ?? null : null;
  const selectedColumnStyle = selectedColumn?.textStyle ?? {};
  const selectedColumnStylePosition = useMemo(() => {
    if (selectedColumnIndex === null || !selectedColumn) {
      return null;
    }
    const columnLeft =
      rowMarkerWidth +
      configuredColumns
        .slice(0, selectedColumnIndex)
        .reduce((total, column) => total + (column.width ?? 160), 0);
    const columnWidth = selectedColumn.width ?? 160;
    return {
      left: Math.max(rowMarkerWidth + 6, columnLeft + columnWidth - 88),
      top: groupHeaderHeight + 5
    };
  }, [configuredColumns, selectedColumn, selectedColumnIndex]);
  const handleGridSelectionChange = useCallback(
    (nextSelection: GridSelection) => {
      const nextIndexes = selectedRowIndexes(nextSelection, filteredRows.length);
      const currentIndexes = selectedRowIndexes(gridSelection, filteredRows.length);
      const currentCellRowIndex = nextSelection.current?.cell[1];
      if (currentCellRowIndex !== undefined && filteredRows[currentCellRowIndex]) {
        setDetailAnchorRowId(filteredRows[currentCellRowIndex].id);
      } else if (nextIndexes.length === 1 && filteredRows[nextIndexes[0]]) {
        setDetailAnchorRowId(filteredRows[nextIndexes[0]].id);
      }

      if (nextIndexes.length === 1 && nextSelection.columns.length === 0) {
        const nextIndex = nextIndexes[0];
        const toggledIndexes = currentIndexes.includes(nextIndex)
          ? currentIndexes.filter((index) => index !== nextIndex)
          : [...currentIndexes, nextIndex];
        setGridSelection(rowSelection(toggledIndexes));
        return;
      }

      setGridSelection(nextSelection);
    },
    [filteredRows, gridSelection]
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const column = configuredColumns[col];
      const record = filteredRows[row];
      const value = record?.values[String(column?.id)] ?? "";
      const isDraftRow = record ? draftRowIds.has(record.id) : false;
      const isFlashing = record?.id === flashRowId;
      const themeOverride = isFlashing ? activeDraftRowTheme.flash : isDraftRow ? activeDraftRowTheme.idle : undefined;
      if (column?.valueKind === "calendar") {
        const items = cellCalendarItems(value);
        return {
          kind: GridCellKind.Custom,
          data: { kind: "calendar-cell", items },
          copyData: calendarCellDisplayData(items),
          allowOverlay: false,
          readonly: true,
          themeOverride
        };
      }
      if (column?.valueKind === "documents") {
        const documents = cellDocuments(value);
        return {
          kind: GridCellKind.Custom,
          data: { kind: "documents-cell", documents, uploadingCount: pendingDocumentUploads[record?.id ?? ""] ?? 0, uploadPulse },
          copyData: documentCellDisplayData(documents),
          allowOverlay: false,
          readonly: true,
          themeOverride
        };
      }
      if (column?.valueKind === "link" && value) {
        const href = String(value);
        return {
          kind: GridCellKind.Uri,
          data: href,
          displayData: column.id === "downloadUrl" ? "Download" : "Open",
          allowOverlay: true,
          hoverEffect: true,
          readonly: false,
          themeOverride: textThemeOverride(activeTableTheme, themeOverride, column.textStyle),
          onClickUri: (args) => {
            args.preventDefault();
            openTableLink(href);
          }
        };
      }
      if (column?.valueKind === "area") {
        const displayData = formatAreaValue(value);
        return {
          kind: GridCellKind.Text,
          data: String(value ?? ""),
          displayData,
          allowOverlay: true,
          readonly: false,
          themeOverride: textThemeOverride(activeTableTheme, themeOverride, column.textStyle),
          contentAlign: "center"
        };
      }
      if (column?.valueKind === "longText") {
        const displayData = String(value ?? "");
        return {
          kind: GridCellKind.Text,
          data: displayData,
          displayData,
          allowOverlay: false,
          readonly: true,
          themeOverride: textThemeOverride(activeTableTheme, themeOverride, column.textStyle)
        };
      }
      if (column?.valueKind === "action") {
        const displayData = textCellValue(value) ?? "Monitor";
        return {
          kind: GridCellKind.Text,
          data: displayData,
          displayData,
          allowOverlay: true,
          readonly: false,
          themeOverride: textThemeOverride(activeTableTheme, themeOverride, column.textStyle),
          contentAlign: "center"
        };
      }
      const displayValue = value;
      const displayData = Array.isArray(displayValue)
        ? displayValue.every(isCalendarCellItem)
          ? calendarCellDisplayData(displayValue)
          : documentCellDisplayData(cellDocuments(displayValue))
        : String(displayValue);
      return {
        kind: GridCellKind.Text,
        data: displayData,
        displayData,
        allowOverlay: true,
        readonly: false,
        themeOverride: textThemeOverride(activeTableTheme, themeOverride, column?.textStyle),
        contentAlign: column?.id === "interest" ? "center" : undefined
      };
    },
    [activeDraftRowTheme, activeTableTheme, configuredColumns, draftRowIds, filteredRows, pendingDocumentUploads, uploadPulse]
  );

  const handleItemHovered = useCallback((args: GridMouseEventArgs) => {
    const frameBounds = gridFrameRef.current?.getBoundingClientRect();
    if (!frameBounds) {
      setRelatedTooltip(null);
      setDocumentTooltip(null);
      setCalendarTooltip(null);
      return;
    }
    if (args.kind === "group-header" && args.group === "Client") {
      setDocumentTooltip(null);
      setCalendarTooltip(null);
      setRelatedTooltip({
        left: args.bounds.x - frameBounds.left + args.bounds.width / 2,
        top: args.bounds.y - frameBounds.top + args.bounds.height + 6,
        placement: "below"
      });
      return;
    }
    if (args.kind === "cell") {
      const column = configuredColumns[args.location[0]];
      const row = filteredRows[args.location[1]];
      const localX = args.localEventX <= args.bounds.width ? args.localEventX : args.localEventX - args.bounds.x;
      const localY = args.localEventY <= args.bounds.height ? args.localEventY : args.localEventY - args.bounds.y;
      setHoveredClientPickerCell(
        column?.id === "client.name" &&
          clientOptionsEndpoint &&
          updateRecordEndpoint &&
          isClientPickerHit(localX, localY, args.bounds.width, args.bounds.height)
          ? args.location
          : null
      );
      if (column?.valueKind === "calendar" && row) {
        const items = cellCalendarItems(row.values[column.id]);
        const relativeTop = args.bounds.y - frameBounds.top;
        const showBelow = relativeTop < 76;
        setRelatedTooltip(null);
        setDocumentTooltip(null);
        setCalendarTooltip(
          items.length > 0
            ? {
                left: args.bounds.x - frameBounds.left + Math.min(Math.max(args.bounds.width / 2, 130), Math.max(130, args.bounds.width - 20)),
                top: showBelow ? relativeTop + args.bounds.height + 8 : Math.max(8, relativeTop - 8),
                placement: showBelow ? "below" : "above",
                items
              }
            : null
        );
        return;
      }
      if (column?.valueKind === "documents" && row) {
        const documents = cellDocuments(row.values[column.id]);
        const relativeX =
          args.localEventX <= args.bounds.width ? args.localEventX - 8 : args.localEventX - args.bounds.x - 8;
        const relativeY = args.localEventY <= args.bounds.height ? args.localEventY - Math.floor((args.bounds.height - documentChipHeight) / 2) : -1;
        const visibleRight = Math.min(args.bounds.x + args.bounds.width, window.innerWidth);
        const uploadStart = Math.max(0, visibleRight - args.bounds.x - documentUploadHitWidth - documentUploadInset - 8);
        const action = documentCellActionAt(relativeX, relativeY, documents, uploadStart);
        if (action?.type === "open") {
          setRelatedTooltip(null);
          setCalendarTooltip(null);
          const hoveredDocument = documents[action.index];
          if (!hoveredDocument) {
            setDocumentTooltip(null);
            return;
          }
          const tooltipLeft = args.bounds.x - frameBounds.left + Math.max(130, Math.min(relativeX + 20, args.bounds.width - 130));
          const relativeTop = args.bounds.y - frameBounds.top;
          const showBelow = relativeTop < 76;
          setDocumentTooltip({
            left: tooltipLeft,
            top: showBelow ? relativeTop + args.bounds.height + 8 : Math.max(8, relativeTop - 8),
            placement: showBelow ? "below" : "above",
            document: hoveredDocument
          });
          return;
        }
      }
    }
    setHoveredClientPickerCell(null);
    setRelatedTooltip(null);
    setDocumentTooltip(null);
    setCalendarTooltip(null);
  }, [clientOptionsEndpoint, configuredColumns, filteredRows, updateRecordEndpoint]);

  const toggleColumn = useCallback((columnId: string) => {
    setPreferences((current) => {
      const hidden = new Set(current.hidden ?? []);
      if (hidden.has(columnId)) {
        hidden.delete(columnId);
      } else {
        hidden.add(columnId);
      }
      return { ...current, hidden: [...hidden] };
    });
  }, []);

  const cycleTableFontScale = useCallback(() => {
    setPreferences((current) => ({ ...current, fontScale: nextFontScale(current.fontScale) }));
  }, []);

  const cycleSelectedColumnWeight = useCallback(() => {
    if (!selectedColumn) {
      return;
    }
    setPreferences((current) => {
      const currentStyle = current.columnTextStyles?.[selectedColumn.id] ?? {};
      const currentWeight = currentStyle.weight ?? (currentStyle.bold ? "super" : undefined);
      const nextWeight = nextColumnWeight(currentWeight);
      const nextStyle: ColumnTextStyle = {
        ...(nextWeight ? { weight: nextWeight } : {}),
        ...(currentStyle.italic ? { italic: true } : {})
      };
      const nextStyles = { ...(current.columnTextStyles ?? {}) };
      if (nextStyle.weight || nextStyle.italic) {
        nextStyles[selectedColumn.id] = nextStyle;
      } else {
        delete nextStyles[selectedColumn.id];
      }
      return {
        ...current,
        columnTextStyles: Object.keys(nextStyles).length > 0 ? nextStyles : undefined
      };
    });
  }, [selectedColumn]);

  const toggleSelectedColumnItalic = useCallback(() => {
    if (!selectedColumn) {
      return;
    }
    setPreferences((current) => {
      const currentStyle = current.columnTextStyles?.[selectedColumn.id] ?? {};
      const currentWeight = currentStyle.weight ?? (currentStyle.bold ? "super" : undefined);
      const nextStyle: ColumnTextStyle = {
        ...(currentWeight ? { weight: currentWeight } : {}),
        ...(!currentStyle.italic ? { italic: true } : {})
      };
      const nextStyles = { ...(current.columnTextStyles ?? {}) };
      if (nextStyle.weight || nextStyle.italic) {
        nextStyles[selectedColumn.id] = nextStyle;
      } else {
        delete nextStyles[selectedColumn.id];
      }
      return {
        ...current,
        columnTextStyles: Object.keys(nextStyles).length > 0 ? nextStyles : undefined
      };
    });
  }, [selectedColumn]);

  const moveColumn = useCallback((sourceIndex: number, targetIndex: number) => {
    setPreferences((current) => {
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }
      const visibleOrder = configuredColumns.map((column) => column.id);
      const fullOrder = [...(current.order ?? columns.map((column) => column.id))];
      const movedId = visibleOrder[sourceIndex];
      const targetId = visibleOrder[targetIndex];
      const sourceFullIndex = fullOrder.indexOf(movedId);
      const targetFullIndex = fullOrder.indexOf(targetId);
      if (sourceFullIndex < 0 || targetFullIndex < 0) {
        return current;
      }
      const order = [...fullOrder];
      order.splice(sourceFullIndex, 1);
      order.splice(targetFullIndex, 0, movedId);
      return { ...current, order };
    });
  }, [columns, configuredColumns]);

  const resizeColumn = useCallback((columnId: string, width: number) => {
    setPreferences((current) => ({
      ...current,
      widths: { ...(current.widths ?? {}), [columnId]: Math.max(80, Math.min(520, width)) }
    }));
  }, []);

  const resizeColumnAtIndex = useCallback((columnIndex: number, width: number) => {
    const column = configuredColumns[columnIndex];
    if (column) {
      resizeColumn(column.id, width);
    }
  }, [configuredColumns, resizeColumn]);

  const createPayloadValues = useCallback(
    (row: CrmTableRow): Record<string, CreateRecordFieldValue> => {
      if (!createRecord) {
        return {};
      }
      return Object.fromEntries(
        createRecord.fields.map((field) => {
          const value = row.values[field.id];
          return [field.id, typeof value === "string" || typeof value === "number" || value === null ? value : null];
        })
      );
    },
    [createRecord]
  );

  const saveDraftRow = useCallback(
    async (row: CrmTableRow) => {
      if (!createRecord || savingDraftIds.has(row.id)) {
        return;
      }
      const hasRequiredValues = createRecord.fields
        .filter((field) => field.required)
        .every((field) => {
          const value = row.values[field.id];
          return typeof value === "number" || (typeof value === "string" && value.trim().length > 0);
        });
      if (!hasRequiredValues) {
        return;
      }
      setSavingDraftIds((current) => new Set(current).add(row.id));
      setCreateError(null);
      try {
        const payload = buildCreateRecordPayload(createPayloadValues(row), createRecord);
        const response = await fetch(createRecord.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const record = (await response.json()) as ApiRecord & { error?: string };
        if (!response.ok) {
          throw new Error(record.error ?? "Create record failed.");
        }
        const createdRow = recordToRow(record, columns);
        setEditableRows((current) =>
          current.map((currentRow) =>
            currentRow.id === row.id
              ? {
                  ...createdRow,
                  values: {
                    ...createdRow.values,
                    ...row.values
                  }
                }
              : currentRow
          )
        );
        setDraftRowIds((current) => {
          const next = new Set(current);
          next.delete(row.id);
          return next;
        });
        setFlashRowId(createdRow.id);
        window.setTimeout(() => setFlashRowId((current) => (current === createdRow.id ? null : current)), 1400);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "Create record failed.");
      } finally {
        setSavingDraftIds((current) => {
          const next = new Set(current);
          next.delete(row.id);
          return next;
        });
      }
    },
    [columns, createPayloadValues, createRecord, savingDraftIds]
  );

  const persistEditedRow = useCallback(
    async (row: CrmTableRow) => {
      if (!createRecord || row.id.startsWith("draft-")) {
        return;
      }
      const payload = {
        ...buildCreateRecordPayload(createPayloadValues(row), createRecord),
        id: row.id
      };
      try {
        const response = await fetch(createRecord.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const record = (await response.json()) as ApiRecord & { error?: string };
        if (!response.ok) {
          throw new Error(record.error ?? "Update record failed.");
        }
        setCreateError(null);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "Update record failed.");
      }
    },
    [createPayloadValues, createRecord]
  );

  const persistInlinePatch = useCallback(
    async (row: CrmTableRow, patch: Record<string, string | null>, label = "Update field") => {
      if (!updateRecordEndpoint || row.id.startsWith("draft-")) {
        return;
      }
      try {
        const response = await fetch(updateRecordEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default",
            leadId: row.id,
            patch,
            source: { channel: "web-table" }
          })
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `${label} failed.`);
        }
        setCreateError(null);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : `${label} failed.`);
      }
    },
    [updateRecordEndpoint]
  );

  const persistNextAction = useCallback(
    async (row: CrmTableRow, value: string) => {
      await persistInlinePatch(row, { todo: value.trim() ? value : null }, "Update next action");
    },
    [persistInlinePatch]
  );

  const persistInlineNoteField = useCallback(
    (row: CrmTableRow, column: CrmTableColumn, value: string) => {
      if (!updateRecordEndpoint || !createRecord?.noteFields?.[column.id]) {
        return false;
      }
      void persistInlinePatch(row, { [column.id]: value.trim() ? value : null }, `Update ${column.title}`);
      return true;
    },
    [createRecord, persistInlinePatch, updateRecordEndpoint]
  );

  const editCell = useCallback(
    (columnIndex: number, rowIndex: number, value: GridCell) => {
      const column = configuredColumns[columnIndex];
      const row = filteredRows[rowIndex];
      if (!column || !row || (value.kind !== GridCellKind.Text && value.kind !== GridCellKind.Uri)) {
        return;
      }
      if (column.valueKind === "action") {
        const nextValue = String(value.data ?? "").trim();
        setEditableRows((current) =>
          updateRowCell(
            updateRowCell(updateRowCell(current, row.id, column.id, nextValue), row.id, "todo", nextValue),
            row.id,
            "nextActionState",
            nextActionStateForTodo(nextValue)
          )
        );
        void persistNextAction(row, nextValue);
        return;
      }
      const nextRow = {
        ...row,
        values: { ...row.values, [column.id]: value.data }
      };
      setEditableRows((current) => updateRowCell(current, row.id, column.id, value.data));
      if (draftRowIds.has(row.id)) {
        void saveDraftRow(nextRow);
      } else if (persistInlineNoteField(row, column, String(value.data ?? ""))) {
        return;
      } else if (createRecord?.fields.some((field) => field.id === column.id)) {
        void persistEditedRow(nextRow);
      }
    },
    [configuredColumns, createRecord, draftRowIds, filteredRows, persistEditedRow, persistInlineNoteField, persistNextAction, saveDraftRow]
  );

  const openCreateRecord = useCallback(() => {
    if (!createRecord) {
      return;
    }
    if (!window.matchMedia("(max-width: 860px)").matches) {
      void gridRef.current?.appendRow(createTargetColumnIndex, true);
      return;
    }
    setCreateValues(Object.fromEntries(createRecord.fields.map((field) => [field.id, ""])));
    setCreateError(null);
    setIsCreateOpen(true);
  }, [createRecord, createTargetColumnIndex]);

  const appendInlineRow = useCallback(async () => {
    if (!createRecord) {
      return undefined;
    }
    const rowId = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const values = Object.fromEntries(columns.map((column) => [column.id, ""])) as Record<string, CrmTableCellValue>;
    const nextRow: CrmTableRow = { id: rowId, values };
    const nextRowIndex = editableRows.length;
    setQuery("");
    setSort(null);
    setCreateError(null);
    setEditableRows((current) => [...current, nextRow]);
    setDraftRowIds((current) => new Set(current).add(rowId));
    setFlashRowId(rowId);
    window.setTimeout(() => setFlashRowId((current) => (current === rowId ? null : current)), 1600);
    window.setTimeout(() => {
      const cell: Item = [createTargetColumnIndex, nextRowIndex];
      setGridSelection(cellSelection(cell));
      gridRef.current?.scrollTo(createTargetColumnIndex, nextRowIndex);
      gridRef.current?.focus();
    }, 0);
    return "bottom" as const;
  }, [columns, createRecord, createTargetColumnIndex, editableRows.length]);

  const submitCreateRecord = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!createRecord) {
        return;
      }
      const missingField = createRecord.fields.find((field) => field.required && !createValues[field.id]?.trim());
      if (missingField) {
        setCreateError(`${missingField.label} is required.`);
        return;
      }
      const payload = buildCreateRecordPayload(createValues, createRecord);
      setIsCreating(true);
      setCreateError(null);
      try {
        const response = await fetch(createRecord.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const record = (await response.json()) as ApiRecord & { error?: string };
        if (!response.ok) {
          throw new Error(record.error ?? "Create record failed.");
        }
        const newRow = recordToRow(record, columns);
        setEditableRows((current) => [
          {
            ...newRow,
            values: {
              ...newRow.values,
              ...Object.fromEntries(
                Object.entries(createValues)
                  .map(([key, value]) => [key, value.trim()])
                  .filter(([, value]) => value)
              )
            }
          },
          ...current
        ]);
        setIsCreateOpen(false);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "Create record failed.");
      } finally {
        setIsCreating(false);
      }
    },
    [columns, createRecord, createValues]
  );

  const handleCellClicked = useCallback(
    ([columnIndex, rowIndex]: Item, event: Parameters<NonNullable<ComponentProps<typeof DataEditor>["onCellClicked"]>>[1]) => {
      const column = configuredColumns[columnIndex];
      const row = filteredRows[rowIndex];
      if (!column || !row) {
        return;
      }
      setDetailAnchorRowId(row.id);
      if (column.group !== "Client" && column.id !== "client.name") {
        setClientPicker(null);
      }
      const frameBounds = gridFrameRef.current?.getBoundingClientRect();
      if (frameBounds) {
        setDetailsButtonPosition({
          left: Math.min(
            Math.max(8, frameBounds.width - 104),
            Math.max(8, event.bounds.x - frameBounds.left + event.bounds.width + 20)
          ),
          top: Math.min(
            Math.max(8, frameBounds.height - 42),
            Math.max(8, event.bounds.y - frameBounds.top + event.bounds.height + 24)
          )
        });
      }
      if ((column.group === "Client" || column.id === "client.name") && clientOptionsEndpoint && updateRecordEndpoint && frameBounds) {
        const localX = event.localEventX <= event.bounds.width ? event.localEventX : event.localEventX - event.bounds.x;
        const localY = event.localEventY <= event.bounds.height ? event.localEventY : event.localEventY - event.bounds.y;
        if (isClientPickerHit(localX, localY, event.bounds.width, event.bounds.height)) {
          event.preventDefault();
          setClientPicker({
            rowId: row.id,
            left: Math.min(event.bounds.x - frameBounds.left + event.bounds.width - 22, Math.max(8, frameBounds.width - 340)),
            top: Math.min(event.bounds.y - frameBounds.top + event.bounds.height + 4, Math.max(8, frameBounds.height - 300)),
            query: "",
            saving: false,
            error: null
          });
          return;
        }
      }
      if (column.valueKind === "calendar") {
        event.preventDefault();
        const items = cellCalendarItems(row.values[column.id]);
        const relativeX =
          event.localEventX <= event.bounds.width ? event.localEventX - 8 : event.localEventX - event.bounds.x - 8;
        const top = Math.floor((event.bounds.height - calendarChipHeight) / 2);
        const relativeY = event.localEventY <= event.bounds.height ? event.localEventY - top : -1;
        const visibleRight = Math.min(event.bounds.x + event.bounds.width - 8, window.innerWidth);
        const availableWidth = Math.max(0, visibleRight - event.bounds.x - 8);
        const action = calendarCellActionAt(relativeX, relativeY, items, availableWidth);
        if (action?.type === "delete") {
          const item = items[action.index];
          if (item) {
            setCellDeleteTarget({ kind: "calendar", rowId: row.id, item });
          }
          return;
        }
        window.location.assign(`/today?leadId=${encodeURIComponent(rowPublicRef(row))}`);
        return;
      }
      if (column.valueKind === "longText") {
        const text = textCellValue(row.values[column.id]);
        if (text) {
          event.preventDefault();
          setLongTextPreview({ title: column.title, text });
        }
        return;
      }
      if (column.valueKind !== "documents") {
        return;
      }
      event.preventDefault();
      const documents = cellDocuments(row.values[column.id]);
      const relativeX =
        event.localEventX <= event.bounds.width ? event.localEventX - 8 : event.localEventX - event.bounds.x - 8;
      const top = Math.floor((event.bounds.height - documentChipHeight) / 2);
      const relativeY = event.localEventY <= event.bounds.height ? event.localEventY - top : -1;
      const visibleRight = Math.min(event.bounds.x + event.bounds.width, window.innerWidth);
      const uploadStart = Math.max(0, visibleRight - event.bounds.x - documentUploadHitWidth - documentUploadInset - 8);
      const action = documentCellActionAt(relativeX, relativeY, documents, uploadStart);
      if (action?.type === "open") {
        setPreviewDocument(documents[action.index] ?? null);
      }
      if (action?.type === "upload") {
        setUploadTarget({ rowId: row.id, files: [] });
        setUploadSummaries([]);
        setUploadError(null);
        window.setTimeout(() => uploadFileInputRef.current?.click(), 0);
      }
    },
    [configuredColumns, filteredRows]
  );

  const closeDocumentUpload = useCallback(() => {
    setUploadTarget(null);
    setUploadSummaries([]);
    setUploadError(null);
    if (uploadFileInputRef.current) {
      uploadFileInputRef.current.value = "";
    }
  }, []);

  const handleDocumentFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      setUploadTarget(null);
      return;
    }
    setUploadTarget((current) => (current ? { ...current, files } : current));
    setUploadSummaries(files.map(() => ""));
    setUploadError(null);
  }, []);

  const updateUploadSummary = useCallback((index: number, value: string) => {
    setUploadSummaries((current) => current.map((summary, summaryIndex) => (summaryIndex === index ? value : summary)));
  }, []);

  const decrementPendingDocumentUploads = useCallback((rowId: string, count: number) => {
    setPendingDocumentUploads((current) => {
      const nextCount = Math.max(0, (current[rowId] ?? 0) - count);
      const next = { ...current };
      if (nextCount === 0) {
        delete next[rowId];
      } else {
        next[rowId] = nextCount;
      }
      return next;
    });
  }, []);

  const submitDocumentUpload = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!uploadTarget || !documentUploadEndpoint) {
        return;
      }
      if (uploadTarget.files.length === 0) {
        setUploadError("Choose at least one file.");
        return;
      }
      const body = new FormData();
      body.set("leadId", uploadTarget.rowId);
      body.set("sourceChannel", "web");
      uploadTarget.files.forEach((file, index) => {
        body.append("files", file);
        body.append("summaries", uploadSummaries[index] ?? "");
      });
      const uploadRowId = uploadTarget.rowId;
      const uploadCount = uploadTarget.files.length;
      setPendingDocumentUploads((current) => ({ ...current, [uploadRowId]: (current[uploadRowId] ?? 0) + uploadCount }));
      setUploadError(null);
      closeDocumentUpload();
      try {
        const response = await fetch(documentUploadEndpoint, { method: "POST", body });
        const payload = (await response.json()) as { documents?: DocumentCellValue; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Upload failed.");
        }
        const uploaded = payload.documents ?? [];
        if (uploaded.length > 0) {
          setEditableRows((current) =>
            current.map((row) =>
              row.id === uploadTarget.rowId
                ? {
                    ...row,
                    values: {
                      ...row.values,
                      documents: [...cellDocuments(row.values.documents), ...uploaded]
                    }
                  }
                : row
            )
          );
        }
        closeDocumentUpload();
      } catch (error) {
        setCreateError(error instanceof Error ? `Upload failed: ${error.message}` : "Upload failed.");
      } finally {
        decrementPendingDocumentUploads(uploadRowId, uploadCount);
      }
    },
    [closeDocumentUpload, decrementPendingDocumentUploads, documentUploadEndpoint, uploadSummaries, uploadTarget]
  );

  const openMobileEdit = useCallback((row: CrmTableRow, column: CrmTableColumn) => {
    if (!updateRecordEndpoint || !isMobileEditableColumn(column)) {
      return;
    }
    setMobileEditTarget({
      rowId: row.id,
      columnId: column.id,
      value: String(mobileDisplayValue(row.values[column.id]) === "n/a" ? "" : mobileDisplayValue(row.values[column.id])),
      saving: false
    });
  }, [updateRecordEndpoint]);

  const handleMobileFieldTap = useCallback((row: CrmTableRow, column: CrmTableColumn) => {
    if (!updateRecordEndpoint || !isMobileEditableColumn(column)) {
      return;
    }
    const key = `${row.id}:${column.id}`;
    const now = Date.now();
    const previous = lastMobileTapRef.current;
    lastMobileTapRef.current = { key, at: now };
    if (previous?.key === key && now - previous.at < 480) {
      openMobileEdit(row, column);
      lastMobileTapRef.current = null;
    }
  }, [openMobileEdit, updateRecordEndpoint]);

  const copyLeadCode = useCallback(async (code: string) => {
    const text = code.trim();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const element = document.createElement("textarea");
      element.value = text;
      element.setAttribute("readonly", "true");
      element.style.position = "fixed";
      element.style.opacity = "0";
      document.body.appendChild(element);
      element.select();
      document.execCommand("copy");
      document.body.removeChild(element);
    }
    setCopiedLeadCode(text);
    window.setTimeout(() => {
      setCopiedLeadCode((current) => (current === text ? null : current));
    }, 1600);
  }, []);

  const cancelMobileEdit = useCallback(() => {
    setMobileEditTarget(null);
  }, []);

  const saveMobileEdit = useCallback(async () => {
    if (!mobileEditTarget || !updateRecordEndpoint || mobileEditTarget.saving) {
      return;
    }
    const { rowId, columnId, value } = mobileEditTarget;
    setMobileEditTarget((current) => (current ? { ...current, saving: true } : current));
    try {
      const response = await fetch(updateRecordEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          leadId: rowId,
          patch: { [columnId]: value },
          source: { channel: "web-mobile" }
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Update failed.");
      }
      setEditableRows((current) => updateRowCell(current, rowId, columnId, value));
      setCreateError(null);
      setMobileEditTarget(null);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Update failed.");
      setMobileEditTarget((current) => (current ? { ...current, saving: false } : current));
    }
  }, [mobileEditTarget, updateRecordEndpoint]);

  const openDetailsPanel = useCallback((row: CrmTableRow) => {
    const values = Object.fromEntries(
      detailsEditableColumns.map((column) => {
        const value = mobileDisplayValue(row.values[column.id]);
        return [column.id, value === "n/a" ? "" : String(value)];
      })
    );
    setDetailsPanelTab("details");
    setDetailsPanel({ rowId: row.id, values, saving: false });
  }, [detailsEditableColumns]);

  const saveDetailsPanel = useCallback(async () => {
    if (!detailsPanel || !detailsPanelRow || !updateRecordEndpoint || detailsPanel.saving) {
      return;
    }
    const patch = Object.fromEntries(
      detailsEditableColumns
        .map((column) => {
          const currentValue = mobileDisplayValue(detailsPanelRow.values[column.id]);
          const currentText = currentValue === "n/a" ? "" : String(currentValue);
          const nextText = detailsPanel.values[column.id] ?? "";
          return currentText === nextText ? null : [column.id, nextText.trim() ? nextText : null];
        })
        .filter((entry): entry is [string, string | null] => Boolean(entry))
    );

    if (Object.keys(patch).length === 0) {
      setDetailsPanel(null);
      return;
    }

    setDetailsPanel((current) => (current ? { ...current, saving: true } : current));
    try {
      const response = await fetch(updateRecordEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          leadId: detailsPanel.rowId,
          patch,
          source: { channel: "web-details" }
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Details update failed.");
      }
      setEditableRows((current) =>
        Object.entries(patch).reduce(
          (rows, [columnId, value]) => updateRowCell(rows, detailsPanel.rowId, columnId, value ?? ""),
          current
        )
      );
      setCreateError(null);
      setDetailsPanel(null);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Details update failed.");
      setDetailsPanel((current) => (current ? { ...current, saving: false } : current));
    }
  }, [detailsEditableColumns, detailsPanel, detailsPanelRow, updateRecordEndpoint]);

  const selectClientForLead = useCallback(
    async (client: ClientOption) => {
      if (!clientPicker || !updateRecordEndpoint || clientPicker.saving) {
        return;
      }
      setClientPicker((current) => (current ? { ...current, saving: true, error: null } : current));
      try {
        const response = await fetch(updateRecordEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default",
            leadId: clientPicker.rowId,
            patch: { clientId: client.id },
            source: { channel: "web-client-picker" }
          })
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Client update failed.");
        }
        setEditableRows((current) =>
          current.map((row) =>
            row.id === clientPicker.rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    "client.name": client.name ?? "n/a",
                    "client.phone": client.phone ?? "n/a",
                    "client.email": client.email ?? "n/a",
                    messenger: client.whatsapp ?? row.values.messenger ?? "n/a"
                  }
                }
              : row
          )
        );
        setClientPicker(null);
        setCreateError(null);
      } catch (error) {
        setClientPicker((current) =>
          current
            ? {
                ...current,
                saving: false,
                error: error instanceof Error ? error.message : "Client update failed."
              }
            : current
        );
      }
    },
    [clientPicker, updateRecordEndpoint]
  );

  const openLeadSummaryHistory = useCallback(async (row: CrmTableRow) => {
    if (!leadSummariesEndpoint) {
      return;
    }
    const currentSummary = mobileLeadSummary(row);
    setLeadSummaryDraft({
      shortSummary: currentSummary?.short ?? "",
      longSummary: currentSummary?.long ?? "",
      saving: false
    });
    setSummaryHistoryTarget({ row, loading: true, error: null, summaries: [] });
    try {
      const url = new URL(leadSummariesEndpoint, window.location.origin);
      url.searchParams.set("leadId", row.id);
      const response = await fetch(url);
      const payload = (await response.json()) as LeadSummaryHistoryResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Summary history failed.");
      }
      setSummaryHistoryTarget({ row, loading: false, error: null, summaries: payload.summaries ?? [] });
    } catch (error) {
      setSummaryHistoryTarget({
        row,
        loading: false,
        error: error instanceof Error ? error.message : "Summary history failed.",
        summaries: []
      });
    }
  }, [leadSummariesEndpoint]);

  const submitLeadSummaryDraft = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!summaryHistoryTarget || !leadSummariesEndpoint || leadSummaryDraft.saving) {
      return;
    }
    const shortSummary = leadSummaryDraft.shortSummary.trim();
    const longSummary = leadSummaryDraft.longSummary.trim();
    if (!shortSummary) {
      setSummaryHistoryTarget((current) =>
        current ? { ...current, error: "Short summary is required." } : current
      );
      return;
    }
    setLeadSummaryDraft((current) => ({ ...current, saving: true }));
    try {
      const response = await fetch(leadSummariesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          leadId: summaryHistoryTarget.row.id,
          shortSummary,
          longSummary: longSummary || null,
          source: "manual"
        })
      });
      const payload = (await response.json()) as { summary?: LeadSummaryHistoryItem; error?: string };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error ?? "Summary save failed.");
      }
      const summary = payload.summary;
      setEditableRows((current) =>
        current.map((row) =>
          row.id === summary.leadId
            ? {
                ...row,
                values: {
                  ...row.values,
                  summaryShort: summary.shortSummary,
                  summaryLong: summary.longSummary,
                  summaryUpdatedAt: summary.createdAt
                }
              }
            : row
        )
      );
      setSummaryHistoryTarget((current) =>
        current
          ? {
              ...current,
              row: {
                ...current.row,
                values: {
                  ...current.row.values,
                  summaryShort: summary.shortSummary,
                  summaryLong: summary.longSummary,
                  summaryUpdatedAt: summary.createdAt
                }
              },
              error: null,
              summaries: [summary, ...current.summaries]
            }
          : current
      );
      setLeadSummaryDraft({ shortSummary: summary.shortSummary, longSummary: summary.longSummary ?? "", saving: false });
    } catch (error) {
      setSummaryHistoryTarget((current) =>
        current
          ? { ...current, error: error instanceof Error ? error.message : "Summary save failed." }
          : current
      );
      setLeadSummaryDraft((current) => ({ ...current, saving: false }));
    }
  }, [leadSummariesEndpoint, leadSummaryDraft, summaryHistoryTarget]);

  const archiveLeadSummary = useCallback(async (summary: LeadSummaryHistoryItem) => {
    if (archivingSummaryIds.has(summary.id)) {
      return;
    }
    setArchivingSummaryIds((current) => new Set(current).add(summary.id));
    try {
      const response = await fetch("/api/crm/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "default", entity: "leadSummary", ids: [summary.id] })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Summary archive failed.");
      }
      setSummaryHistoryTarget((current) => {
        if (!current) {
          return current;
        }
        const summaries = current.summaries.filter((item) => item.id !== summary.id);
        const latest = summaries[0] ?? null;
        return {
          ...current,
          error: null,
          row: {
            ...current.row,
            values: {
              ...current.row.values,
              summaryShort: latest?.shortSummary ?? null,
              summaryLong: latest?.longSummary ?? null,
              summaryUpdatedAt: latest?.createdAt ?? null
            }
          },
          summaries
        };
      });
      setEditableRows((current) =>
        current.map((row) => {
          if (row.id !== summary.leadId) {
            return row;
          }
          const target = summaryHistoryTarget?.summaries.filter((item) => item.id !== summary.id)[0] ?? null;
          return {
            ...row,
            values: {
              ...row.values,
              summaryShort: target?.shortSummary ?? null,
              summaryLong: target?.longSummary ?? null,
              summaryUpdatedAt: target?.createdAt ?? null
            }
          };
        })
      );
    } catch (error) {
      setSummaryHistoryTarget((current) =>
        current
          ? { ...current, error: error instanceof Error ? error.message : "Summary archive failed." }
          : current
      );
    } finally {
      setSummaryArchiveConfirmId(null);
      setArchivingSummaryIds((current) => {
        const next = new Set(current);
        next.delete(summary.id);
        return next;
      });
    }
  }, [archivingSummaryIds, summaryHistoryTarget]);

  const drawCell = useCallback<NonNullable<ComponentProps<typeof DataEditor>["drawCell"]>>(
    (args, drawContent) => {
      if (args.row < 0) {
        drawContent();
        return;
      }
      const column = configuredColumns[args.col];
      if (column?.valueKind === "action" && args.cell.kind === GridCellKind.Text) {
        const row = filteredRows[args.row];
        const text = args.cell.displayData || args.cell.data || "Monitor";
        const tone = actionTone(row?.values.nextActionState);
        const { ctx, rect, theme } = args;
        const fontSize = fontSizeFromTheme(theme, 13);
        const fontFamily = theme.fontFamily ?? "Inter, sans-serif";
        const chipHeight = Math.max(18, Math.min(rect.height - 8, fontSize + 8));
        const dotSize = 6;

        ctx.save();
        ctx.font = `600 ${theme.baseFontStyle ?? `${fontSize}px`} ${fontFamily}`;
        const maxChipWidth = rect.width - 12;
        const textWidth = Math.min(ctx.measureText(text).width, Math.max(30, maxChipWidth - 28));
        const chipWidth = Math.min(maxChipWidth, textWidth + 26);
        const chipX = rect.x + Math.max(6, (rect.width - chipWidth) / 2);
        const chipY = rect.y + (rect.height - chipHeight) / 2;
        ctx.beginPath();
        ctx.roundRect(chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
        ctx.fillStyle = tone.fill;
        ctx.fill();
        ctx.strokeStyle = tone.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(chipX + 11, rect.y + rect.height / 2, dotSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = tone.dot;
        ctx.fill();

        ctx.fillStyle = isDarkMode ? theme.textDark : tone.text;
        ctx.textBaseline = "middle";
        ctx.fillText(text, chipX + 19, rect.y + rect.height / 2, chipWidth - 24);
        ctx.restore();
        drawSearchMatchHighlight(args, query, isDarkMode);
        return;
      }

      drawContent();
      drawSearchMatchHighlight(args, query, isDarkMode);
      if (column?.group !== "Client") {
        return;
      }

      const { ctx, rect } = args;
      const edgeColor = colorWithAlpha(linkedTableColor, isDarkMode ? 0.52 : 0.42);
      const innerFog = colorWithAlpha(linkedTableColor, isDarkMode ? 0.12 : 0.08);
      const outerFog = colorWithAlpha(linkedTableColor, isDarkMode ? 0.2 : 0.14);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();

      const leftGradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + 18, rect.y);
      leftGradient.addColorStop(0, outerFog);
      leftGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = leftGradient;
      ctx.fillRect(rect.x, rect.y + 1, 18, rect.height - 2);

      const rightGradient = ctx.createLinearGradient(rect.x + rect.width - 18, rect.y, rect.x + rect.width, rect.y);
      rightGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      rightGradient.addColorStop(1, innerFog);
      ctx.fillStyle = rightGradient;
      ctx.fillRect(rect.x + rect.width - 18, rect.y + 1, 18, rect.height - 2);

      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x + 1.5, rect.y + 3);
      ctx.lineTo(rect.x + 1.5, rect.y + rect.height - 3);
      ctx.moveTo(rect.x + rect.width - 1.5, rect.y + 3);
      ctx.lineTo(rect.x + rect.width - 1.5, rect.y + rect.height - 3);
      ctx.stroke();

      const isFocusedClientCell =
        column.id === "client.name" &&
        gridSelection.current?.cell[0] === args.col &&
        gridSelection.current?.cell[1] === args.row;
      if (isFocusedClientCell && clientOptionsEndpoint && updateRecordEndpoint) {
        const isIconHovered = hoveredClientPickerCell?.[0] === args.col && hoveredClientPickerCell?.[1] === args.row;
        const iconLeft = rect.x + rect.width - clientPickerHitSize - 4;
        const iconTop = rect.y + Math.max(4, (rect.height - clientPickerHitSize) / 2);
        ctx.fillStyle = isIconHovered ? colorWithAlpha(linkedTableColor, isDarkMode ? 0.36 : 0.24) : colorWithAlpha(linkedTableColor, isDarkMode ? 0.16 : 0.1);
        ctx.strokeStyle = isIconHovered ? colorWithAlpha(linkedTableColor, isDarkMode ? 0.9 : 0.78) : colorWithAlpha(linkedTableColor, isDarkMode ? 0.52 : 0.44);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(iconLeft, iconTop, clientPickerHitSize, clientPickerHitSize, 6);
        ctx.fill();
        ctx.stroke();

        const cx = iconLeft + 9;
        const cy = iconTop + 9;
        ctx.strokeStyle = isIconHovered ? contrastTextColor(linkedTableColor) : isDarkMode ? "#d9e7df" : "#486257";
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 3, 0, Math.PI * 2);
        ctx.moveTo(cx - 5, cy + 8);
        ctx.quadraticCurveTo(cx, cy + 2, cx + 5, cy + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconLeft + 16, iconTop + 10);
        ctx.lineTo(iconLeft + 19, iconTop + 13);
        ctx.lineTo(iconLeft + 22, iconTop + 10);
        ctx.stroke();
      }
      ctx.restore();
    },
    [clientOptionsEndpoint, configuredColumns, filteredRows, gridSelection.current?.cell, hoveredClientPickerCell, isDarkMode, linkedTableColor, query, updateRecordEndpoint]
  );

  const confirmDeleteSelectedRows = useCallback(async () => {
    const selectedIds = new Set(selectedRows.map((row) => row.id));
    if (archiveEntity) {
      const response = await fetch("/api/crm/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: archiveEntity, ids: [...selectedIds] })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setCreateError(payload.error ? `Delete failed: ${payload.error}` : "Delete failed.");
        setBulkActionDialog(null);
        return;
      }
    }
    setEditableRows((current) => current.filter((row) => !selectedIds.has(row.id)));
    setDraftRowIds((current) => {
      const next = new Set(current);
      selectedIds.forEach((id) => next.delete(id));
      return next;
    });
    setSavingDraftIds((current) => {
      const next = new Set(current);
      selectedIds.forEach((id) => next.delete(id));
      return next;
    });
    setGridSelection(emptySelection());
    setBulkActionDialog(null);
  }, [archiveEntity, selectedRows]);

  const confirmDeleteCellItem = useCallback(async () => {
    if (!cellDeleteTarget || isDeletingCellItem) {
      return;
    }
    const entity: ArchiveRecordEntity =
      cellDeleteTarget.kind === "document"
        ? "documentFile"
        : cellDeleteTarget.item.kind === "reminder"
          ? "reminder"
          : "calendarEvent";
    setIsDeletingCellItem(true);
    try {
      const response = await fetch("/api/crm/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "default", entity, ids: [cellDeleteTarget.item.id] })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Delete failed.");
      }
      setEditableRows((current) =>
        current.map((row) => {
          if (row.id !== cellDeleteTarget.rowId) {
            return row;
          }
          if (cellDeleteTarget.kind === "document") {
            return {
              ...row,
              values: {
                ...row.values,
                documents: cellDocuments(row.values.documents).filter((document) => document.id !== cellDeleteTarget.item.id)
              }
            };
          }
          return {
            ...row,
            values: {
              ...row.values,
              calendar: cellCalendarItems(row.values.calendar).filter(
                (item) => !(item.id === cellDeleteTarget.item.id && item.kind === cellDeleteTarget.item.kind)
              )
            }
          };
        })
      );
      setCreateError(null);
      setCellDeleteTarget(null);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setIsDeletingCellItem(false);
    }
  }, [cellDeleteTarget, isDeletingCellItem]);

  const generateOfferForSelectedRow = useCallback(async () => {
    const row = selectedRows[0];
    if (!row || !offerGenerateEndpoint || isGeneratingOffer) {
      return;
    }
    setIsGeneratingOffer(true);
    setCreateError(null);
    try {
      const response = await fetch(offerGenerateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: row.id })
      });
      const payload = (await response.json()) as { document?: DocumentCellItem; error?: string };
      if (!response.ok || !payload.document) {
        throw new Error(payload.error ?? "Commercial offer generation failed.");
      }
      const document = payload.document;
      setEditableRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                values: {
                ...item.values,
                  documents: [...cellDocuments(item.values.documents), document]
                }
              }
            : item
        )
      );
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Commercial offer generation failed.");
    } finally {
      setIsGeneratingOffer(false);
    }
  }, [isGeneratingOffer, offerGenerateEndpoint, selectedRows]);

  const visibleColumnIds = new Set(configuredColumns.map((column) => column.id));
  const allColumnsByPreference = applyTablePreferences(columns, { ...preferences, hidden: [] });
  const clientPickerOptions = clientPicker
    ? clientOptions
        .filter((client) => {
          const queryText = clientPicker.query.trim().toLowerCase();
          if (!queryText) {
            return true;
          }
          return [client.code, client.name, client.company, client.email, client.phone, client.whatsapp]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(queryText));
        })
        .slice(0, 8)
    : [];
  const mobileColumns = configuredColumns
    .filter((column) => !["description", "summaryShort", "summaryLong", "summaryUpdatedAt"].includes(column.id))
    .slice()
    .sort((left, right) => (left.mobilePriority ?? 99) - (right.mobilePriority ?? 99))
    .slice(0, 6);

  return (
    <section className="tableSurface">
      <header className="tableHeader">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="toolbar" aria-label={`${title} actions`} ref={toolbarRef}>
          {selectedRows.length > 0 ? (
            <div className="bulkActionBar" role="status" aria-live="polite">
              <span>
                {selectedRows.length} {selectedRows.length === 1 ? "record" : "records"} selected
              </span>
              <div>
                {selectedRows.length === 1 ? (
                  <>
                    {offerGenerateEndpoint ? (
                      <button
                        type="button"
                        title="Generate offer"
                        aria-label="Generate offer"
                        onClick={generateOfferForSelectedRow}
                        disabled={isGeneratingOffer}
                      >
                        <FileText size={14} />
                        {isGeneratingOffer ? "Generating" : "Generate offer"}
                      </button>
                    ) : null}
                    <button type="button" className="danger" onClick={() => setBulkActionDialog("delete")}>
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setBulkActionDialog("merge")}>
                    <Merge size={15} />
                    Try to merge
                  </button>
                )}
                <button type="button" className="clearSelectionButton" aria-label="Clear row selection" onClick={() => setGridSelection(emptySelection())}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : null}
          <label className={`searchBox ${query.trim() ? "active" : ""}`}>
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>
          <button
            type="button"
            className="toolbarIconButton toolbarCreateButton"
            title={createRecord ? "Create row" : "Create row unavailable"}
            aria-label="Create row"
            disabled={!createRecord}
            onClick={openCreateRecord}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="toolbarIconButton toolbarColumnsButton"
            title="Columns"
            aria-label="Columns"
            onClick={() => setShowColumnMenu((value) => !value)}
          >
            <Columns3 size={16} />
          </button>
          <button
            type="button"
            className="toolbarIconButton fontScaleButton"
            title={`Table font ${tableFontLabel(tableFontScale)}`}
            aria-label={`Table font ${tableFontLabel(tableFontScale)}`}
            onClick={cycleTableFontScale}
          >
            <span aria-hidden="true">{tableFontIcon(tableFontScale)}</span>
          </button>
          <button
            type="button"
            className="toolbarIconButton toolbarExportButton"
            title="Export CSV"
            aria-label="Export CSV"
            onClick={() => downloadCsv(`${tableKey}.csv`, toCsv(configuredColumns, filteredRows))}
          >
            <Download size={16} />
          </button>
          <div className="tableColorControl">
            <button
              type="button"
              className="tableColorButton"
              title="Table relation color"
              aria-label="Table relation color"
              aria-expanded={isColorPickerOpen}
              onClick={() => setIsColorPickerOpen((value) => !value)}
              style={{ "--table-color": tableColor, "--table-color-text": contrastTextColor(tableColor) } as ComponentProps<"button">["style"]}
            >
              <Palette size={14} />
            </button>
            {isColorPickerOpen ? (
              <div className="tableColorPopover" role="dialog" aria-label="Choose table relation color">
                <label>
                  <span>Relation color</span>
                  <input
                    type="color"
                    value={tableColor}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        tableColor: event.target.value
                      }))
                    }
                  />
                </label>
                <div className="tableColorPresets" aria-label="Preset colors">
                  {["#4da377", "#bd7b8d", "#8d88c6", "#c08b62", "#6e94af"].map((color) => (
                    <button
                      type="button"
                      key={color}
                      aria-label={`Use ${color}`}
                      className={tableColor.toLowerCase() === color ? "active" : ""}
                      style={{ "--table-color": color } as ComponentProps<"button">["style"]}
                      onClick={() => setPreferences((current) => ({ ...current, tableColor: color }))}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {showColumnMenu ? (
            <div className="columnDropdown" aria-label={`${title} visible columns`}>
              <div className="columnDropdownHeader">
                <span>Columns</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreferences(defaultPreferences(columns));
                    setSort(null);
                  }}
                >
                  Default
                </button>
              </div>
              {allColumnsByPreference.map((column) => {
                const isVisible = visibleColumnIds.has(column.id);
                return (
                  <label className="columnMenuItem" key={column.id}>
                    <input checked={isVisible} onChange={() => toggleColumn(column.id)} type="checkbox" />
                    <span>{column.title}</span>
                    {isVisible ? <Check size={14} aria-hidden="true" /> : null}
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>
      {createError && !isCreateOpen ? <div className="tableNotice error">{createError}</div> : null}
      <div className="gridFrame" ref={gridFrameRef} onMouseLeave={() => {
        setRelatedTooltip(null);
        setDocumentTooltip(null);
        setCalendarTooltip(null);
        setHoveredClientPickerCell(null);
      }}>
        {relatedTooltip ? (
          <div
            className={`relatedTableTooltip ${relatedTooltip.placement === "below" ? "relatedTableTooltipBelow" : ""}`}
            style={tableTooltipStyle(relatedTooltip.left, relatedTooltip.top)}
          >
            <strong>Related table</strong>
            <span>These columns show fields from the linked client record.</span>
          </div>
      ) : null}
      {documentTooltip ? (
        <div
          className={`relatedTableTooltip documentCellTooltip ${documentTooltip.placement === "below" ? "relatedTableTooltipBelow" : ""}`}
          style={tableTooltipStyle(documentTooltip.left, documentTooltip.top)}
        >
          <strong>{documentTooltip.document.fileName}</strong>
          {formatDocumentCreatedAt(documentTooltip.document.createdAt) ? (
            <span>Added {formatDocumentCreatedAt(documentTooltip.document.createdAt)}</span>
          ) : null}
          <span>{documentTooltip.document.shortSummary}</span>
        </div>
      ) : null}
        {calendarTooltip ? (
        <div
          className={`relatedTableTooltip calendarCellTooltip ${calendarTooltip.placement === "below" ? "relatedTableTooltipBelow" : ""}`}
          style={tableTooltipStyle(calendarTooltip.left, calendarTooltip.top)}
        >
          <strong>Scheduled events</strong>
          {sortCalendarItemsByStart(calendarTooltip.items).map((item) => (
            <span key={`${item.kind}-${item.id}`}>
              {calendarDayMonthLabel(item.startsAt)} {calendarTimeLabel(item.startsAt)} · {item.title}
            </span>
          ))}
        </div>
      ) : null}
        {activeDetailRow && updateRecordEndpoint ? (
          <button
            className={`detailsFloatingButton${detailsButtonPosition ? " positioned" : ""}`}
            type="button"
            style={
              detailsButtonPosition
                ? ({
                    "--details-button-left": `${detailsButtonPosition.left}px`,
                    "--details-button-top": `${detailsButtonPosition.top}px`
                  } as ComponentProps<"button">["style"])
                : undefined
            }
            onClick={() => openDetailsPanel(activeDetailRow)}
          >
            Details
          </button>
        ) : null}
        {clientPicker ? (
          <div className="clientPickerPopover" style={{ left: clientPicker.left, top: clientPicker.top }}>
            <header>
              <strong>Change client</strong>
              <button type="button" aria-label="Close client picker" onClick={() => setClientPicker(null)}>
                <X size={13} />
              </button>
            </header>
            <input
              autoFocus
              placeholder="Search clients"
              value={clientPicker.query}
              onChange={(event) => setClientPicker((current) => (current ? { ...current, query: event.target.value } : current))}
            />
            {clientPicker.error ? <p className="clientPickerError">{clientPicker.error}</p> : null}
            <div className="clientPickerList">
              {clientPickerOptions.length > 0 ? (
                clientPickerOptions.map((client) => (
                  <button type="button" key={client.id} onClick={() => void selectClientForLead(client)} disabled={clientPicker.saving}>
                    <span>{client.code ?? client.id}</span>
                    <strong>{client.name ?? "Unnamed client"}</strong>
                    <small>{[client.phone, client.email].filter(Boolean).join(" · ") || client.company || "No contact details"}</small>
                  </button>
                ))
              ) : (
                <p>No clients found.</p>
              )}
            </div>
          </div>
        ) : null}
        {selectedColumn && selectedColumnStylePosition ? (
          <div
            className="columnStyleToggles"
            style={{ left: selectedColumnStylePosition.left, top: selectedColumnStylePosition.top }}
            aria-label={`${selectedColumn.title} column text style`}
          >
            <button
              type="button"
              className={`columnWeightButton ${selectedColumnStyle.weight ? `active ${selectedColumnStyle.weight}` : ""}`}
              title={`Column weight: ${columnWeightLabel(selectedColumnStyle.weight)}`}
              aria-label={`Column weight: ${columnWeightLabel(selectedColumnStyle.weight)}`}
              onClick={cycleSelectedColumnWeight}
            >
              <span aria-hidden="true">B</span>
            </button>
            <button
              type="button"
              className={selectedColumnStyle.italic ? "active" : ""}
              title="Italic column"
              aria-label="Italic column"
              aria-pressed={Boolean(selectedColumnStyle.italic)}
              onClick={toggleSelectedColumnItalic}
            >
              <Italic size={12} />
            </button>
          </div>
        ) : null}
        <DataEditor
          ref={gridRef}
          columns={visibleColumns}
          rows={filteredRows.length}
          getCellContent={getCellContent}
          gridSelection={gridSelection}
          onGridSelectionChange={handleGridSelectionChange}
          onHeaderClicked={(columnIndex) => {
            const column = configuredColumns[columnIndex];
            if (column) {
              setGridSelection(columnSelection(columnIndex));
              setSort((current) => nextSort(current, column.id));
            }
          }}
          onHeaderMenuClick={() => setShowColumnMenu((value) => !value)}
          onColumnMoved={moveColumn}
          onColumnResize={(_, width, columnIndex) => resizeColumnAtIndex(columnIndex, width)}
          onRowAppended={appendInlineRow}
          onCellEdited={([columnIndex, rowIndex], value) => editCell(columnIndex, rowIndex, value)}
          onCellClicked={handleCellClicked}
          customRenderers={[documentCellRenderer, calendarCellRenderer]}
          drawCell={drawCell}
          getGroupDetails={(groupName) =>
            groupName === "Client"
              ? {
                  name: "Client",
                  overrideTheme: activeRelatedTableHeaderTheme
                }
              : { name: groupName }
          }
          onItemHovered={handleItemHovered}
          groupHeaderHeight={groupHeaderHeight}
          minColumnWidth={80}
          maxColumnWidth={520}
          width="100%"
          height="100%"
          rowMarkerWidth={rowMarkerWidth}
          rowMarkers={{ kind: "both", checkboxStyle: "square", width: rowMarkerWidth }}
          theme={activeTableTheme}
          cellActivationBehavior="double-click"
          smoothScrollX
          smoothScrollY
        />
      </div>
      <div className="mobileTableList">
        {filteredRows.map((row) => {
          const summary = mobileLeadSummary(row) ?? { short: "", long: null, updatedAt: null };
          const hasSummary = Boolean(summary.short);
          const description = textCellValue(row.values.description);
          const publicRowCode = textCellValue(row.values.code);
          const leadName = textCellValue(row.values.projectName) ?? textCellValue(row.values.name) ?? row.id;
          const clientName = textCellValue(row.values["client.name"]) ?? textCellValue(row.values.name);
          const offerMissingFields = offerMissingFieldChips(row.values.offerMissingFields);
          const documents = sortDocumentsByAdded(cellDocuments(row.values.documents));
          if (isLeadTable) {
            return (
              <article
                className={`mobileTableRow mobileLeadCard${row.id === flashRowId ? " focused" : ""}`}
                key={row.id}
                ref={(element) => {
                  if (element) {
                    mobileRowRefs.current.set(row.id, element);
                  } else {
                    mobileRowRefs.current.delete(row.id);
                  }
                }}
              >
                <button
                  type="button"
                  className="mobileLeadCardHeader"
                  onClick={() => void copyLeadCode(publicRowCode ?? row.id)}
                  aria-label={`Copy lead number ${publicRowCode ?? row.id}`}
                >
                  <span className="mobileLeadCardCode">{publicRowCode ?? row.id}</span>
                  <strong className="mobileLeadCardName">{leadName}</strong>
                </button>
                {copiedLeadCode === (publicRowCode ?? row.id) ? (
                  <div className="mobileLeadCopiedNotice" role="status">
                    Lead number copied
                  </div>
                ) : null}

                <div className="mobileLeadCardFields">
                  <span>Client</span>
                  <strong>{clientName ?? "n/a"}</strong>
                  <span>Lead name</span>
                  <strong>{leadName}</strong>
                </div>

                {description ? (
                  <section className="mobileLeadCardSection">
                    <span>Description</span>
                    <p>{description}</p>
                  </section>
                ) : null}

                <section className="mobileLeadCardSection">
                  <span>Missing for offer</span>
                  {offerMissingFields.length > 0 ? (
                    <div className="mobileLeadMissingChips">
                      {offerMissingFields.map((field) => (
                        <i key={field}>{field}</i>
                      ))}
                    </div>
                  ) : (
                    <p className="mobileLeadMuted">No missing fields detected.</p>
                  )}
                </section>

                {hasSummary ? (
                  <section className="mobileLeadCardSection">
                    <span>Summary</span>
                    <p className="mobileLeadCardSummaryText">{summary.short}</p>
                    {summary.long ? (
                      <details className="mobileLeadFullSummary">
                        <summary>Full summary</summary>
                        <p>{summary.long}</p>
                        {leadSummariesEndpoint ? (
                          <button type="button" onClick={() => openLeadSummaryHistory(row)}>
                            History
                          </button>
                        ) : null}
                      </details>
                    ) : null}
                  </section>
                ) : null}

                <details className="mobileLeadDownloads">
                  <summary>
                    <span>
                      Downloads: {documents.length} {documents.length === 1 ? "item" : "items"}
                    </span>
                    <i aria-hidden="true">⌄</i>
                  </summary>
                  {documents.length > 0 ? (
                    <div className="leadDocumentCardList">
                      {documents.map((document) => {
                        const extension = documentExtensionLabel(document.fileName, document.mimeType);
                        const createdAt = formatDocumentCreatedAt(document.createdAt);
                        return (
                          <button
                            type="button"
                            className="leadDocumentCard mobileLeadDocumentCard"
                            key={document.id}
                            title={`${document.fileName}${document.shortSummary ? `\n${document.shortSummary}` : ""}`}
                            onClick={() => setPreviewDocument(document)}
                          >
                            <span
                              className="leadDocumentCardBadge"
                              style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                            >
                              {extension.slice(0, 3)}
                            </span>
                            <span className="leadDocumentCardMain">
                              <strong>{documentChipTitle(document.fileName)}</strong>
                              <span>{createdAt ? `Added ${createdAt}` : "Added date unknown"}</span>
                            </span>
                            <span className="leadDocumentCardSummary">{document.shortSummary || "No summary yet"}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mobileLeadMuted">No documents yet.</p>
                  )}
                </details>
              </article>
            );
          }
          return (
            <article
              className={`mobileTableRow${row.id === flashRowId ? " focused" : ""}`}
              key={row.id}
              ref={(element) => {
                if (element) {
                  mobileRowRefs.current.set(row.id, element);
                } else {
                  mobileRowRefs.current.delete(row.id);
                }
              }}
            >
              {publicRowCode ? <h2 className="mobileRowTitle">{publicRowCode}</h2> : null}
              {mobileColumns.filter((column) => column.valueKind !== "longText").map((column) => {
                const isEditing = mobileEditTarget?.rowId === row.id && mobileEditTarget.columnId === column.id;
                const canEdit = isMobileEditableColumn(column) && Boolean(updateRecordEndpoint);
                if (column.valueKind === "documents") {
                  const documents = sortDocumentsByAdded(cellDocuments(row.values[column.id]));
                  return (
                    <div className="mobileField mobileDocumentsField" key={column.id}>
                      <span>{column.title}</span>
                      {documents.length > 0 ? (
                        <div className="leadDocumentCardList">
                          {documents.map((document) => {
                            const extension = documentExtensionLabel(document.fileName, document.mimeType);
                            const createdAt = formatDocumentCreatedAt(document.createdAt);
                            return (
                              <button
                                type="button"
                                className="leadDocumentCard"
                                key={document.id}
                                title={`${document.fileName}${document.shortSummary ? `\n${document.shortSummary}` : ""}`}
                                onClick={() => setPreviewDocument(document)}
                              >
                                <span
                                  className="leadDocumentCardBadge"
                                  style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                                >
                                  {extension.slice(0, 3)}
                                </span>
                                <span className="leadDocumentCardMain">
                                  <strong>{documentChipTitle(document.fileName)}</strong>
                                  <span>{createdAt ? `Added ${createdAt}` : "Added date unknown"}</span>
                                </span>
                                <span className="leadDocumentCardSummary">{document.shortSummary || "No summary yet"}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <strong>No documents</strong>
                      )}
                    </div>
                  );
                }
                if (column.valueKind === "calendar") {
                  const calendarItems = sortCalendarItemsByStart(cellCalendarItems(row.values[column.id]));
                  const firstCalendarItem = nearestCalendarItem(calendarItems);
                  const monthAnchor = (() => {
                    const storedMonth = mobileCalendarMonths[row.id];
                    if (storedMonth) {
                      const storedDate = calendarDate(storedMonth);
                      if (storedDate) {
                        return calendarMonthStart(storedDate);
                      }
                    }
                    const firstDate = firstCalendarItem ? calendarDate(firstCalendarItem.startsAt) : null;
                    return calendarMonthStart(firstDate ?? new Date());
                  })();
                  const monthDays = calendarMonthGrid(monthAnchor);
                  const monthDayItems = calendarItemsByDay(calendarItems);
                  return (
                    <div className="mobileField mobileCalendarField" key={column.id}>
                      {firstCalendarItem ? (
                        <details className="mobileCalendarDetails">
                          <summary title={calendarCellDisplayData(calendarItems)}>
                            <span>{column.title}</span>
                            <strong>{mobileCalendarTitle(firstCalendarItem)}</strong>
                          </summary>
                          <div className="mobileMiniCalendar" aria-label={`${column.title} month view`}>
                            <div className="mobileMiniCalendarHeader">
                              <button
                                aria-label="Previous calendar month"
                                type="button"
                                onClick={() =>
                                  setMobileCalendarMonths((current) => ({
                                    ...current,
                                    [row.id]: calendarDayKey(calendarAddMonths(monthAnchor, -1))
                                  }))
                                }
                              >
                                &lt;
                              </button>
                              <strong>{calendarMonthLabel(monthAnchor)}</strong>
                              <button
                                aria-label="Next calendar month"
                                type="button"
                                onClick={() =>
                                  setMobileCalendarMonths((current) => ({
                                    ...current,
                                    [row.id]: calendarDayKey(calendarAddMonths(monthAnchor, 1))
                                  }))
                                }
                              >
                                &gt;
                              </button>
                            </div>
                            <div className="mobileMiniCalendarWeekdays" aria-hidden="true">
                              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                                <span key={`${day}-${index}`}>{day}</span>
                              ))}
                            </div>
                            <div className="mobileMiniCalendarGrid">
                              {monthDays.map((day) => {
                                const key = calendarDayKey(day);
                                const dayItems = monthDayItems.get(key) ?? [];
                                const isOutsideMonth = day.getMonth() !== monthAnchor.getMonth();
                                const isToday = key === calendarDayKey(new Date());
                                return (
                                  <div
                                    className={`mobileMiniCalendarDay${isOutsideMonth ? " outside" : ""}${dayItems.length > 0 ? " hasEvents" : ""}${isToday ? " today" : ""}`}
                                    key={key}
                                    title={dayItems.length > 0 ? calendarCellDisplayData(dayItems) : undefined}
                                  >
                                    <span>{day.getDate()}</span>
                                    {dayItems.length > 0 ? <i>{dayItems.length}</i> : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="mobileCalendarInlineList">
                            <span>Next events</span>
                            <ul>
                              {calendarItems.map((item) => (
                                <li key={`${item.kind}-${item.id}`}>
                                  <span>{calendarDateLabel(item.startsAt)} {calendarTimeLabel(item.startsAt)}</span>
                                  <strong>{item.title}</strong>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <button
                            className="mobileCalendarCreateButton"
                            type="button"
                            onClick={() => window.location.assign(`/today?leadId=${encodeURIComponent(rowPublicRef(row))}`)}
                          >
                            Add event
                          </button>
                        </details>
                      ) : (
                        <>
                          <span>{column.title}</span>
                          <strong>No events</strong>
                          <button
                            className="mobileCalendarCreateButton"
                            type="button"
                            onClick={() => window.location.assign(`/today?leadId=${encodeURIComponent(rowPublicRef(row))}`)}
                          >
                            Add event
                          </button>
                        </>
                      )}
                    </div>
                  );
                }
                return (
                  <div
                    className={`mobileField ${canEdit ? "editable" : ""} ${isEditing ? "editing" : ""}`}
                    key={column.id}
                    onClick={() => handleMobileFieldTap(row, column)}
                    onDoubleClick={() => openMobileEdit(row, column)}
                  >
                    <span>{column.title}</span>
                    {isEditing ? (
                      <div className="mobileInlineEditor">
                        {isMobileMultilineColumn(column.id) ? (
                          <textarea
                            autoFocus
                            rows={2}
                            value={mobileEditTarget.value}
                            onChange={(event) =>
                              setMobileEditTarget((current) => (current ? { ...current, value: event.target.value } : current))
                            }
                          />
                        ) : (
                          <input
                            autoFocus
                            value={mobileEditTarget.value}
                            onChange={(event) =>
                              setMobileEditTarget((current) => (current ? { ...current, value: event.target.value } : current))
                            }
                          />
                        )}
                        <button type="button" onClick={saveMobileEdit} disabled={mobileEditTarget.saving} aria-label="Save field">
                          <Check size={14} />
                        </button>
                        <button type="button" onClick={cancelMobileEdit} aria-label="Cancel edit">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <strong>{column.valueKind === "area" ? formatAreaValue(row.values[column.id]) : mobileDisplayValue(row.values[column.id])}</strong>
                    )}
                  </div>
                );
              })}
              {description ? (
                <details className="mobileDescriptionDetails">
                  <summary>Description</summary>
                  <p>{description}</p>
                </details>
              ) : null}
              {hasSummary ? (
                <div className="mobileLeadSummary">
                  <span>Summary{summary.updatedAt ? ` · ${mobileDisplayValue(summary.updatedAt)}` : ""}</span>
                  <strong>{summary.short}</strong>
                  {summary.long ? (
                    <details>
                      <summary>Full summary</summary>
                      <p>{summary.long}</p>
                      {leadSummariesEndpoint ? (
                        <button type="button" onClick={() => openLeadSummaryHistory(row)}>
                          History
                        </button>
                      ) : null}
                    </details>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {detailsPanel && detailsPanelRow ? (
        <div className="detailsDrawerBackdrop" role="presentation" onMouseDown={() => setDetailsPanel(null)}>
          <aside className="detailsDrawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Lead details</span>
                <h2>{String(mobileDisplayValue(detailsPanelRow.values.code) || detailsPanelRow.id)}</h2>
                <p>{String(mobileDisplayValue(detailsPanelRow.values.projectName) || detailsPanelRow.id)}</p>
              </div>
              <button type="button" onClick={() => setDetailsPanel(null)} aria-label="Close lead details">
                <X size={18} />
              </button>
            </header>
            <div className="detailsDrawerTabs" role="tablist" aria-label="Lead detail sections">
              <button
                type="button"
                className={detailsPanelTab === "details" ? "active" : ""}
                role="tab"
                aria-selected={detailsPanelTab === "details"}
                onClick={() => setDetailsPanelTab("details")}
              >
                Details
              </button>
              <button
                type="button"
                className={detailsPanelTab === "documents" ? "active" : ""}
                role="tab"
                aria-selected={detailsPanelTab === "documents"}
                onClick={() => setDetailsPanelTab("documents")}
              >
                Documents <span>{detailsPanelDocuments.length}</span>
              </button>
            </div>
            {detailsPanelTab === "details" ? (
              <div className="detailsDrawerFields">
                {detailsEditableColumns.map((column) => (
                  <label className={isMobileMultilineColumn(column.id) ? "wide" : ""} key={column.id}>
                    <span>{column.title}</span>
                    {isMobileMultilineColumn(column.id) ? (
                      <textarea
                        rows={3}
                        value={detailsPanel.values[column.id] ?? ""}
                        onChange={(event) =>
                          setDetailsPanel((current) =>
                            current ? { ...current, values: { ...current.values, [column.id]: event.target.value } } : current
                          )
                        }
                      />
                    ) : (
                      <input
                        value={detailsPanel.values[column.id] ?? ""}
                        onChange={(event) =>
                          setDetailsPanel((current) =>
                            current ? { ...current, values: { ...current.values, [column.id]: event.target.value } } : current
                          )
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            ) : (
              <div className="detailsDrawerDocuments">
                {detailsPanelDocuments.length > 0 ? (
                  <div className="leadDocumentCardList">
                    {detailsPanelDocuments.map((document) => {
                      const extension = documentExtensionLabel(document.fileName, document.mimeType);
                      const createdAt = formatDocumentCreatedAt(document.createdAt);
                      return (
                        <button
                          type="button"
                          className="leadDocumentCard"
                          key={document.id}
                          title={`${document.fileName}${document.shortSummary ? `\n${document.shortSummary}` : ""}`}
                          onClick={() => setPreviewDocument(document)}
                        >
                          <span
                            className="leadDocumentCardBadge"
                            style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                          >
                            {extension.slice(0, 3)}
                          </span>
                          <span className="leadDocumentCardMain">
                            <strong>{documentChipTitle(document.fileName)}</strong>
                            <span>{createdAt ? `Added ${createdAt}` : "Added date unknown"}</span>
                          </span>
                          <span className="leadDocumentCardSummary">{document.shortSummary || "No summary yet"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="detailsDrawerEmpty">No documents linked to this lead yet.</p>
                )}
              </div>
            )}
            <footer>
              {detailsPanelTab === "details" ? (
                <>
                  <button type="button" onClick={() => setDetailsPanel(null)}>
                    Cancel
                  </button>
                  <button type="button" className="primary" onClick={saveDetailsPanel} disabled={detailsPanel.saving}>
                    {detailsPanel.saving ? "Saving" : "Save details"}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setDetailsPanel(null)}>
                  Close
                </button>
              )}
            </footer>
          </aside>
        </div>
      ) : null}
      {bulkActionDialog === "merge" ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setBulkActionDialog(null)}>
          <section className="bulkActionDialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Try to merge</span>
                <h2>Merge is not implemented yet</h2>
              </div>
              <button type="button" onClick={() => setBulkActionDialog(null)} aria-label="Close merge dialog">
                <X size={18} />
              </button>
            </header>
            <p>
              You selected {selectedRows.length} records. The merge assistant is not connected yet, so no data was changed.
            </p>
            <footer>
              <button type="button" onClick={() => setBulkActionDialog(null)}>
                OK
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {cellDeleteTarget ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setCellDeleteTarget(null)}>
          <section className="bulkActionDialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>{cellDeleteTarget.kind === "document" ? "Delete document" : "Delete calendar item"}</span>
                <h2>Confirm deletion</h2>
              </div>
              <button type="button" onClick={() => setCellDeleteTarget(null)} aria-label="Close delete confirmation">
                <X size={18} />
              </button>
            </header>
            <p>
              {cellDeleteTarget.kind === "document"
                ? cellDeleteTarget.item.fileName
                : `${cellDeleteTarget.item.title} · ${calendarDayMonthLabel(cellDeleteTarget.item.startsAt)} ${calendarTimeLabel(cellDeleteTarget.item.startsAt)}`}
            </p>
            <footer>
              <button type="button" onClick={() => setCellDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteCellItem} disabled={isDeletingCellItem}>
                {isDeletingCellItem ? "Deleting" : "Yes, delete"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {bulkActionDialog === "delete" ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setBulkActionDialog(null)}>
          <section className="bulkActionDialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Delete record</span>
                <h2>Delete this record?</h2>
              </div>
              <button type="button" onClick={() => setBulkActionDialog(null)} aria-label="Close delete dialog">
                <X size={18} />
              </button>
            </header>
            <p>
              {archiveEntity
                ? "This archives the selected record after confirmation."
                : "This removes the selected row from the current table view. This table does not have a server archive action yet."}
            </p>
            <footer>
              <button type="button" onClick={() => setBulkActionDialog(null)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDeleteSelectedRows}>
                Delete
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {summaryHistoryTarget ? (
        <div
          className="documentModalBackdrop"
          role="presentation"
          onMouseDown={() => {
            setSummaryHistoryTarget(null);
            setSummaryArchiveConfirmId(null);
          }}
        >
          <section className="documentModal leadSummaryHistoryModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>SUMMARY</span>
                <h2>{String(mobileDisplayValue(summaryHistoryTarget.row.values.code) || summaryHistoryTarget.row.id)}</h2>
              </div>
              <button type="button" onClick={() => setSummaryHistoryTarget(null)} aria-label="Close summary history">
                <X size={18} />
              </button>
            </header>
            {summaryHistoryTarget.loading ? <p>Loading summary history...</p> : null}
            {summaryHistoryTarget.error ? <p className="documentUploadError">{summaryHistoryTarget.error}</p> : null}
            <form className="leadSummaryComposer" onSubmit={submitLeadSummaryDraft}>
              <label>
                <span>Short summary</span>
                <textarea
                  rows={2}
                  maxLength={240}
                  value={leadSummaryDraft.shortSummary}
                  onChange={(event) =>
                    setLeadSummaryDraft((current) => ({ ...current, shortSummary: event.target.value }))
                  }
                  placeholder="Two-line lead summary"
                />
              </label>
              <label>
                <span>Full summary</span>
                <textarea
                  rows={4}
                  maxLength={1200}
                  value={leadSummaryDraft.longSummary}
                  onChange={(event) =>
                    setLeadSummaryDraft((current) => ({ ...current, longSummary: event.target.value }))
                  }
                  placeholder="Longer summary for the collapsible card section"
                />
              </label>
              <button type="submit" disabled={leadSummaryDraft.saving || !leadSummaryDraft.shortSummary.trim()}>
                {leadSummaryDraft.saving ? "Saving" : "Save summary"}
              </button>
            </form>
            {!summaryHistoryTarget.loading && summaryHistoryTarget.summaries.length === 0 ? (
              <p>No summary history yet.</p>
            ) : null}
            <div className="leadSummaryHistoryList">
              {summaryHistoryTarget.summaries.map((summaryItem) => (
                <article key={summaryItem.id}>
                  <span>
                    {formatDocumentCreatedAt(summaryItem.createdAt) ?? summaryItem.createdAt}
                    {summaryItem.source ? ` · ${summaryItem.source}` : ""}
                  </span>
                  <strong>{summaryItem.shortSummary}</strong>
                  {summaryItem.longSummary ? <p>{summaryItem.longSummary}</p> : null}
                  <button
                    type="button"
                    className={`summaryArchiveButton${summaryArchiveConfirmId === summaryItem.id ? " confirm" : ""}`}
                    onClick={() => {
                      if (summaryArchiveConfirmId === summaryItem.id) {
                        void archiveLeadSummary(summaryItem);
                        return;
                      }
                      setSummaryArchiveConfirmId(summaryItem.id);
                    }}
                    disabled={archivingSummaryIds.has(summaryItem.id)}
                  >
                    {archivingSummaryIds.has(summaryItem.id)
                      ? "Archiving"
                      : summaryArchiveConfirmId === summaryItem.id
                        ? "Confirm archive"
                        : "Archive"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {longTextPreview ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setLongTextPreview(null)}>
          <section className="documentModal longTextModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Lead field</span>
                <h2>{longTextPreview.title}</h2>
              </div>
              <button type="button" onClick={() => setLongTextPreview(null)} aria-label="Close text preview">
                <X size={18} />
              </button>
            </header>
            <p>{longTextPreview.text}</p>
          </section>
        </div>
      ) : null}
      {previewDocument ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setPreviewDocument(null)}>
          <section className="documentModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>{documentExtensionLabel(previewDocument.fileName, previewDocument.mimeType)}</span>
                <h2>{previewDocument.fileName}</h2>
              </div>
              <button type="button" onClick={() => setPreviewDocument(null)} aria-label="Close document preview">
                ×
              </button>
            </header>
            <p>{previewDocument.longSummary ?? previewDocument.shortSummary}</p>
            {previewDocument.downloadUrl ? (
              <div className="documentPreviewFrame">
                {previewDocument.mimeType?.startsWith("image/") ? (
                  <img alt={previewDocument.fileName} src={previewDocument.downloadUrl} />
                ) : (
                  <iframe title={previewDocument.fileName} src={previewDocument.downloadUrl} />
                )}
              </div>
            ) : (
              <div className="documentPreviewEmpty">Preview is unavailable for this file.</div>
            )}
            <footer className="documentPreviewActions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const ownerRow = editableRows.find((row) =>
                    cellDocuments(row.values.documents).some((document) => document.id === previewDocument.id)
                  );
                  if (ownerRow) {
                    setPreviewDocument(null);
                    setCellDeleteTarget({ kind: "document", rowId: ownerRow.id, item: previewDocument });
                  }
                }}
              >
                Delete
              </button>
              <div className="documentPreviewActionGroup">
                {previewDocument.downloadUrl ? (
                  <a href={previewDocument.downloadUrl} download={previewDocument.fileName}>
                    Download
                  </a>
                ) : null}
                <button type="button" onClick={() => setPreviewDocument(null)}>
                  Close
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
      {isCreateOpen && createRecord ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setIsCreateOpen(false)}>
          <form className="documentModal recordCreateForm" onSubmit={submitCreateRecord} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>ADD</span>
                <h2>Add record</h2>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} aria-label="Close create form">
                ×
              </button>
            </header>
            {createRecord.fields.map((field) => (
              <label className={field.multiline ? "formField wide" : "formField"} key={field.id}>
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea
                    rows={3}
                    value={createValues[field.id] ?? ""}
                    onChange={(event) => setCreateValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    required={field.required}
                  />
                ) : (
                  <input
                    value={createValues[field.id] ?? ""}
                    onChange={(event) => setCreateValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    required={field.required}
                  />
                )}
              </label>
            ))}
            {createError ? <p className="documentUploadError">{createError}</p> : null}
            <footer>
              <button type="button" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={isCreating}>
                {isCreating ? "Creating" : "Create"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      <input
        ref={uploadFileInputRef}
        className="hiddenFileInput"
        type="file"
        multiple
        onChange={handleDocumentFileChange}
      />
      {uploadTarget && uploadTarget.files.length > 0 ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={closeDocumentUpload}>
          <form className="documentModal documentUploadForm" onSubmit={submitDocumentUpload} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>ADD</span>
                <h2>Add documents</h2>
              </div>
              <button type="button" onClick={closeDocumentUpload} aria-label="Close upload form">
                ×
              </button>
            </header>
            <div className="selectedUploadFiles">
              {uploadTarget.files.map((file, index) => (
                <label className="selectedUploadFile" key={`${file.name}-${file.size}-${index}`}>
                  <span>File {index + 1}</span>
                  <strong>{file.name}</strong>
                  <textarea
                    value={uploadSummaries[index] ?? ""}
                    onChange={(event) => updateUploadSummary(index, event.target.value)}
                    placeholder="Short file summary"
                    rows={2}
                  />
                </label>
              ))}
            </div>
            {uploadError ? <p className="documentUploadError">{uploadError}</p> : null}
            <footer>
              <button type="button" onClick={closeDocumentUpload}>
                Cancel
              </button>
              <button type="submit" disabled={isUploading || !documentUploadEndpoint}>
                {isUploading ? "Uploading" : `Upload ${uploadTarget.files.length}`}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
