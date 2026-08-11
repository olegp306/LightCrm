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
import {
  Archive,
  Check,
  Columns3,
  Download,
  FileText,
  Flame,
  Globe2,
  Italic,
  Merge,
  MessageCircle,
  Palette,
  Plus,
  Reply,
  Search,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import type { ChangeEvent, ComponentProps, CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyTablePreferences,
  buildCreateRecordPayload,
  compactDocumentTitle,
  currentTouchChipTone,
  documentDisplayLabel,
  documentExtensionLabel,
  filterRowsByCountry,
  formatAreaValue,
  formatOutreachProtocolChannel,
  formatOutreachProtocolDate,
  formatOutreachTouchActionLabel,
  formatOutreachTouchProgressLabel,
  handoffSideTone,
  leadProgressReward,
  nextActionStateForTodo,
  orderOutreachTouchpoints,
  outreachOutcomeOptions,
  parseOutreachTouchProgress,
  recordToRow,
  shouldWrapTableColumn,
  sortRows,
  toCsv,
  updateRowCell,
  wrappedTableRowHeight,
  wrapMeasuredTextLines,
  type ApiRecord,
  type ColumnTextStyle,
  type CreateRecordFieldValue,
  type CreateRecordPayloadConfig,
  type OutreachProtocolItem,
  type TablePreferences,
  type TableSort
} from "./table-model";
import {
  autosaveLabelForDraft,
  shouldSaveOutreachDraft
} from "./outreach-draft-autosave";
import { coldTargetPingLabel, coldTargetPingTone } from "./cold-target-model";
import { darkTableTheme, lightTableTheme, scaledTableTheme } from "./table-theme";

type DrawCellArgs = Parameters<NonNullable<ComponentProps<typeof DataEditor>["drawCell"]>>[0];

export type CrmTableColumn = {
  id: string;
  title: string;
  width?: number;
  defaultVisible?: boolean;
  mobilePriority?: number;
  group?: string;
  valueKind?: "text" | "link" | "documents" | "calendar" | "area" | "longText" | "action" | "handoff" | "ping" | "currentTouch";
  wrapText?: boolean;
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

export type OutreachProtocolValue = OutreachProtocolItem[];

export type CrmTableCellValue = string | number | null | DocumentCellValue | CalendarCellValue | OutreachProtocolValue;

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

export type OfferFeeTableRow = {
  bgfFrom: number;
  bgfTo: number;
  wohnflaecheLabel: string;
  lp1_3Net: number;
  lp4Net: number;
  totalNet: number;
  vat: number;
  totalGross: number;
};

export type OutreachCampaignTouchpoint = {
  id: string;
  touchNumber: number;
  dayOffset: number;
  channel: "email" | "linkedin" | "phone";
  title: string;
  action: string;
  templateId?: string;
};

export type OutreachCampaign = {
  id: string;
  name: string;
  status: "active" | "draft" | "archived";
  summary: string;
  goal: string;
  prompt: string;
  touchpoints: OutreachCampaignTouchpoint[];
};

type OutreachProtocolEntry = {
  id: string;
  channel: string;
  subject: string | null;
  occurredAt: string;
  outcome: string | null;
  authorEmail: string | null;
  authorName: string;
  authorCode: string;
};

function visibleClientReference(client: ClientOption): string | null {
  const code = client.code?.trim();
  if (code && !/^csv-client-/i.test(code)) {
    return code;
  }
  return /^C-\d{4}-\d+/i.test(client.id) ? client.id : null;
}

function clientPickerLabel(client: ClientOption | null, fallbackName?: string | null): string {
  if (!client) {
    return fallbackName?.trim() ? fallbackName.trim() : "No client selected";
  }
  return [
    visibleClientReference(client),
    client.name?.trim() || "Unnamed client",
    client.phone?.trim(),
    client.email?.trim()
  ]
    .filter(Boolean)
    .join(" | ");
}

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
  updateRecordIdField?: string;
  offerGenerateEndpoint?: string;
  offerTemplateFields?: string[];
  offerFeeRows?: OfferFeeTableRow[];
  outreachCampaigns?: OutreachCampaign[];
  outreachStartEndpoint?: string;
  outreachAdvanceEndpoint?: string;
  outreachDraftEndpoint?: string;
  outreachProtocolEndpoint?: string;
  sendToTelegramEndpoint?: string;
  clientOptionsEndpoint?: string;
  clientLinkEndpoint?: string;
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

type HandoffBallType = "football" | "basketball" | "volleyball" | "potato";

type HandoffSoundPreset = {
  label: string;
  src: string;
};

type HandoffCustomCell = CustomCell<{
  kind: "handoff-cell";
  side: "us" | "client";
  ballType: HandoffBallType;
  progress: number | null;
  from: "us" | "client" | null;
  to: "us" | "client" | null;
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

type BulkActionDialog = "archive" | "delete" | "merge" | "spicyArchive" | null;
type ArchiveMood = "regular" | "spicy";
type WrappedTextTooltip = {
  left: number;
  top: number;
  placement: "above" | "below";
  title: string;
  text: string;
};

type CellBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MobileEditTarget = {
  rowId: string;
  columnId: string;
  value: string;
  saving: boolean;
};

type DetailsPanelState = {
  rowId: string;
  values: Record<string, string>;
  clientPickerOpen: boolean;
  selectedClientId: string | null;
  saving: boolean;
};

type OutreachDraftState = {
  reminderId?: string;
  subject: string;
  body: string;
  channel: OutreachCampaignTouchpoint["channel"];
  dueAt: string | null;
  status: string | null;
  action: string;
  email: string | null;
  loading: boolean;
  saving?: boolean;
  dirty?: boolean;
  savedSubject?: string | null;
  savedBody?: string | null;
  error: string | null;
  message?: string | null;
  personaHook?: string;
  promptApplied?: boolean;
  recreated?: boolean;
};

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
    tableColor: defaultTableColor,
    handoffBall: "football",
    handoffSoundEnabled: true
  };
}

const handoffBallLabels: Record<HandoffBallType, { label: string; icon: string }> = {
  football: { label: "Football", icon: "\u26BD" },
  basketball: { label: "Basketball", icon: "\u{1F3C0}" },
  volleyball: { label: "Volleyball", icon: "\u{1F3D0}" },
  potato: { label: "Hot potato", icon: "\u{1F954}" }
};

const handoffSoundPresets: Record<HandoffBallType, HandoffSoundPreset> = {
  football: { label: "Quick kick", src: "/sounds/handoff/football-quick-kick.mp3" },
  basketball: { label: "Net", src: "/sounds/handoff/basketball-net.mp3" },
  volleyball: { label: "Catch", src: "/sounds/handoff/volleyball-catch.mp3" },
  potato: { label: "Pop click", src: "/sounds/handoff/potato-pop-click.mp3" }
};

const handoffBallIcons: Record<HandoffBallType, string> = {
  football: "\u26BD",
  basketball: "\u{1F3C0}",
  volleyball: "\u{1F3D0}",
  potato: "\u{1F954}"
};
const handoffInsightIcon = "\u{1F4A1}";

export type LeadProgressState = "locked" | "available" | "current" | "completed";

export type LeadProgressStage = {
  id: string;
  label: string;
  color: string;
  description: string;
  image: string;
};

const firstTouchChannelOptions = [
  { value: "", label: "Auto" },
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "phone", label: "Call" }
] as const;

function countryFilterLabel(value: string): string {
  return value.trim().toLocaleLowerCase() === "germany" ? "Germany" : value.trim();
}

type LeadAchievement = {
  id: string;
  label: string;
  color: string;
  image: string;
  effect: "soft" | "bounce" | "wiggle" | "money";
};

export const leadProgressStages: LeadProgressStage[] = [
  {
    id: "proposal",
    label: "Proposal",
    color: "#2563eb",
    description: "Proposal prepared and sent.",
    image: "/lead-progress/01-mail-sent.png"
  },
  {
    id: "contract",
    label: "Contract",
    color: "#7c3aed",
    description: "Contract shared and under review.",
    image: "/lead-progress/02-lead-replied.png"
  },
  {
    id: "prepayment-invoice",
    label: "Prepayment invoice",
    color: "#b45309",
    description: "Prepayment invoice is ready to send.",
    image: "/lead-progress/03-client-written.png"
  },
  {
    id: "prepayment-confirmed",
    label: "Prepayment confirmed",
    color: "#15803d",
    description: "Prepayment has been confirmed.",
    image: "/lead-progress/04-proposal-sent.png"
  },
  {
    id: "power-of-attorney",
    label: "Power of attorney",
    color: "#475569",
    description: "Power of attorney is being collected.",
    image: "/lead-progress/05-proposal-reworked.png"
  },
  {
    id: "final-invoice",
    label: "Final invoice",
    color: "#0f766e",
    description: "Final invoice is prepared for the client.",
    image: "/lead-progress/06-meeting-booked.png"
  },
  {
    id: "final-payment-confirmed",
    label: "Final payment confirmed",
    color: "#ea580c",
    description: "Final payment has landed.",
    image: "/lead-progress/07-call-done.png"
  },
  {
    id: "client-review",
    label: "Client review",
    color: "#db2777",
    description: "Client review requested and received.",
    image: "/lead-progress/08-client-agreed.png"
  }
];

const leadProgressFinalStageIndex = leadProgressStages.length - 1;

export function normalizeLeadProgressStage(value: CrmTableCellValue | undefined): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= leadProgressFinalStageIndex ? numeric : 0;
}

export function deriveLeadProgressState(stageIndex: number, selectedStage: number): LeadProgressState {
  const normalizedStage = normalizeLeadProgressStage(selectedStage);
  if (stageIndex < normalizedStage) {
    return "completed";
  }
  if (stageIndex === normalizedStage) {
    return "current";
  }
  if (stageIndex === normalizedStage + 1) {
    return "available";
  }
  return "locked";
}

function isLeadProgressStageLocked(stageIndex: number, selectedStage: number): boolean {
  return deriveLeadProgressState(stageIndex, selectedStage) === "locked";
}

export function buildLeadProgressUpdateRequest(updateRecordIdField: string, rowId: string, progressStage: number) {
  return {
    workspaceId: "default",
    [updateRecordIdField]: rowId,
    patch: { progressStage },
    source: { channel: "web-details" as const }
  };
}

function normalizedHandoffSide(value: CrmTableCellValue | undefined): "us" | "client" {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return text === "client" || text === "customer" || text === "them" ? "client" : "us";
}

function normalizedHandoffBall(value: TablePreferences["handoffBall"]): HandoffBallType {
  return value && value in handoffBallLabels ? value : "football";
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

function rowIsArchived(row: CrmTableRow | null | undefined): boolean {
  if (!row) {
    return false;
  }
  const status = typeof row.values.status === "string" ? row.values.status.toLocaleLowerCase() : "";
  return Boolean(row.values.archivedAt) || status === "archived";
}

function rowArchiveMood(row: CrmTableRow | null | undefined): ArchiveMood {
  return row?.values.archiveMood === "spicy" ? "spicy" : "regular";
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

function isInlineLongTextColumn(column: CrmTableColumn | undefined): boolean {
  return shouldWrapTableColumn(column) || column?.id === "description";
}

function isWrappedAddressColumn(column: CrmTableColumn | undefined): boolean {
  return column?.id === "address";
}

function wrappedCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): { lines: string[]; overflow: boolean } {
  return wrapMeasuredTextLines(text, maxWidth, maxLines, (value) => ctx.measureText(value).width);
}

function wrappedCellTooltipForHover(input: {
  column: CrmTableColumn | undefined;
  row: CrmTableRow | undefined;
  bounds: CellBounds;
  frameBounds: DOMRect;
  theme: Partial<Theme>;
}): WrappedTextTooltip | null {
  const { column, row, bounds, frameBounds, theme } = input;
  if (!column || !row || !(shouldWrapTableColumn(column) || isWrappedAddressColumn(column))) {
    return null;
  }
  const text = textCellValue(row.values[column.id]);
  if (!text) {
    return null;
  }
  const fontSize = fontSizeFromTheme(theme, 13);
  const fontFamily = theme.fontFamily ?? "Inter, sans-serif";
  const padding = theme.cellHorizontalPadding ?? 8;
  const availableWidth = Math.max(10, bounds.width - padding * 2);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.font = `${theme.baseFontStyle ?? `${fontSize}px`} ${fontFamily}`;
  const maxLines = isWrappedAddressColumn(column) ? 2 : 3;
  const wrapped = wrapMeasuredTextLines(text, availableWidth, maxLines, (value) => ctx.measureText(value).width);
  if (!wrapped.overflow) {
    return null;
  }
  const relativeTop = bounds.y - frameBounds.top;
  const showBelow = relativeTop < 140;
  const preferredLeft = bounds.x - frameBounds.left + Math.min(Math.max(bounds.width / 2, 160), Math.max(160, bounds.width - 24));
  return {
    left: Math.max(170, Math.min(frameBounds.width - 170, preferredLeft)),
    top: showBelow ? relativeTop + bounds.height + 8 : Math.max(8, relativeTop - 8),
    placement: showBelow ? "below" : "above",
    title: column.title,
    text
  };
}

function fitTextWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = "...";
  let clipped = text.trimEnd();
  while (clipped.length > 0 && ctx.measureText(`${clipped}${ellipsis}`).width > maxWidth) {
    clipped = clipped.slice(0, -1).trimEnd();
  }
  return clipped ? `${clipped}${ellipsis}` : ellipsis;
}

function drawWrappedTextCell(args: DrawCellArgs, text: string, options: { maxLines?: number; ellipsis?: boolean } = {}): void {
  const { ctx, rect, theme } = args;
  const fontSize = fontSizeFromTheme(theme, 13);
  const fontFamily = theme.fontFamily ?? "Inter, sans-serif";
  const padding = theme.cellHorizontalPadding ?? 8;
  const lineHeight = Math.round(fontSize * 1.28);
  const maxLines = Math.max(1, Math.floor((rect.height - 10) / lineHeight));
  const preferredMaxLines = options.maxLines ?? 3;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + 2, rect.y + 1, rect.width - 4, rect.height - 2);
  ctx.clip();
  ctx.font = `${theme.baseFontStyle ?? `${fontSize}px`} ${fontFamily}`;
  ctx.fillStyle = theme.textDark;
  ctx.textBaseline = "top";
  const textWidth = Math.max(10, rect.width - padding * 2);
  const { lines, overflow } = wrappedCanvasLines(ctx, text, textWidth, Math.min(preferredMaxLines, maxLines));
  if (overflow && options.ellipsis && lines.length > 0) {
    lines[lines.length - 1] = fitTextWithEllipsis(ctx, lines[lines.length - 1], textWidth);
  }
  const totalHeight = lines.length * lineHeight;
  const startY = rect.y + Math.max(5, (rect.height - totalHeight) / 2);
  lines.forEach((line, index) => {
    ctx.fillText(line, rect.x + padding, startY + index * lineHeight, rect.width - padding * 2);
  });
  if (overflow && !options.ellipsis) {
    const label = "more";
    const labelWidth = ctx.measureText(label).width + 10;
    const labelHeight = Math.max(14, fontSize + 2);
    const labelX = rect.x + rect.width - padding - labelWidth;
    const labelY = rect.y + rect.height - labelHeight - 3;
    ctx.fillStyle = theme.bgCell;
    ctx.fillRect(labelX - 4, labelY - 1, labelWidth + 6, labelHeight + 2);
    ctx.fillStyle = theme.textMedium;
    ctx.font = `600 ${Math.max(9, fontSize - 3)}px ${fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX + 5, labelY + labelHeight / 2);
  }
  ctx.restore();
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

function isOutreachProtocolItem(value: unknown): value is OutreachProtocolItem {
  return Boolean(value && typeof value === "object" && "channel" in value && "occurredAt" in value);
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

function readableDateTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function compactCalendarTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= calendarTitleMaxLength ? normalized : `${normalized.slice(0, calendarTitleMaxLength)}...`;
}

function calendarCellDisplayData(items: CalendarCellValue): string {
  return items.map((item) => `${calendarDateLabel(item.startsAt)} ${calendarTimeLabel(item.startsAt)} ${item.title}`).join(", ");
}

function outreachDraftKey(rowId: string, campaignId: string, touchId: string): string {
  return `${rowId}:${campaignId}:${touchId}`;
}

function gmailComposeUrl(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: email,
    su: subject,
    body
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function emailBodyParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
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

function visibleCalendarCellItems(items: CalendarCellValue): CalendarCellValue {
  const now = Date.now();
  return sortCalendarItemsByStart(items).filter((item) => {
    const startsAt = calendarDate(item.startsAt);
    if (!startsAt) {
      return true;
    }
    return startsAt.getTime() >= now;
  });
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
      return rightTime - leftTime;
    }
    return left.fileName.localeCompare(right.fileName);
  });
}

function cellCalendarItems(value: CrmTableCellValue | undefined): CalendarCellValue {
  return Array.isArray(value) && value.every(isCalendarCellItem) ? value : [];
}

function cellOutreachProtocol(value: CrmTableCellValue | undefined): OutreachProtocolValue {
  return Array.isArray(value) && value.every(isOutreachProtocolItem) ? value : [];
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

const leadFieldGuideItems = [
  {
    field: "Lead ID",
    source: "Automatic",
    meaning: "Human-readable lead number generated by year and sequence, for example L-2026-011."
  },
  {
    field: "Client",
    source: "Linked client",
    meaning: "Client connected to the lead. It can be selected manually or resolved from unique contact data."
  },
  {
    field: "Lead name",
    source: "Manual / intake",
    meaning: "Short project title used as the main lead heading in the table, web card, and TG card."
  },
  {
    field: "Area",
    source: "Manual / intake",
    meaning: "Project area. Used for commercial offer readiness and fee calculations when available."
  },
  {
    field: "Description",
    source: "Manual",
    meaning: "Editable working description of the request. This is not an automatic summary."
  },
  {
    field: "Interest",
    source: "Manual",
    meaning: "Lead temperature or interest level, such as warm or hot, for prioritization."
  },
  {
    field: "Urgency",
    source: "Manual",
    meaning: "How quickly the team should react to this lead."
  },
  {
    field: "Todo",
    source: "Manual / agent",
    meaning: "Next action for the operator or CRM team."
  },
  {
    field: "Ball",
    source: "Manual",
    meaning: "Shows whose side the initiative is on: our team or the client."
  },
  {
    field: "Address",
    source: "Manual / intake",
    meaning: "Project address or location. Used in lead cards, search, and offer readiness."
  },
  {
    field: "Phone",
    source: "Linked client",
    meaning: "Client phone from the linked client or lead contact data."
  },
  {
    field: "Email",
    source: "Linked client",
    meaning: "Client email from the linked client or lead contact data."
  },
  {
    field: "Messenger",
    source: "Manual / intake",
    meaning: "Preferred communication channel, such as TG or WhatsApp."
  },
  {
    field: "Source",
    source: "Automatic",
    meaning: "Where the lead came from: TG, web, import, or another intake channel."
  },
  {
    field: "Summary",
    source: "Automatic",
    meaning: "Short semantic lead summary. Created on lead creation, document intake, explicit regeneration, or important allowed updates."
  },
  {
    field: "Full summary",
    source: "Automatic",
    meaning: "Richer semantic lead summary with client intent, extracted facts, document notes, and copy-friendly context."
  },
  {
    field: "Summary updated",
    source: "Automatic",
    meaning: "Timestamp of the latest saved lead summary."
  },
  {
    field: "Documents",
    source: "Documents",
    meaning: "Files linked to the lead. Each file has its own short and full summary."
  },
  {
    field: "Calendar",
    source: "Calendar",
    meaning: "Scheduled events and reminders linked to this lead."
  },
  {
    field: "Raw input",
    source: "Technical",
    meaning: "Original incoming text kept for audit/debugging. It should not be used as the main working description."
  },
  {
    field: "Deal net",
    source: "Manual / offer",
    meaning: "Net deal amount from the commercial offer or entered manually. This is the amount used with Oleg %; it is separate from the legacy Budget EUR input and calculated offer totals."
  },
  {
    field: "Oleg %",
    source: "Manual / default",
    meaning: "Oleg's commission rate. New leads start at 2%; the percentage can be changed manually."
  },
  {
    field: "Oleg commission",
    source: "Manual switch",
    meaning: "Turns Oleg's commission calculation on or off for this lead. New leads are enabled by default; existing leads stay disabled unless changed."
  },
  {
    field: "Budget EUR",
    source: "Manual / intake",
    meaning: "Legacy budget or manual gross price used to unlock commercial-offer generation. It is not the same as Deal net."
  },
  {
    field: "Missing for offer",
    source: "Automatic",
    meaning: "Fields still needed before a commercial offer can be priced or generated."
  }
] as const;

const leadFieldGuideByField: Map<string, (typeof leadFieldGuideItems)[number]> = new Map(
  leadFieldGuideItems.map((item) => [item.field, item])
);

const coldTargetFieldGuideItems = [
  { field: "Target ID", source: "Automatic", meaning: "Stable identifier for the target record." },
  { field: "Name", source: "Manual / import", meaning: "Person or organization contact name used in the target card." },
  { field: "Company", source: "Manual / import", meaning: "Company connected to the target." },
  { field: "Country", source: "Manual / import", meaning: "Country used by the country filter and search." },
  { field: "Role", source: "Manual / import", meaning: "Contact role. Long text wraps to three lines and the full value appears on hover." },
  { field: "Hook", source: "Manual / import", meaning: "Personalized reason or angle for starting the conversation with this target." },
  { field: "Email", source: "Manual / import", meaning: "Email used for outreach drafts and sending." },
  { field: "Phone", source: "Manual / import", meaning: "Phone number for a cold call or follow-up." },
  { field: "Website", source: "Manual / import", meaning: "Company or contact website." },
  { field: "LinkedIn", source: "Manual / import", meaning: "LinkedIn profile or company URL." },
  { field: "Language", source: "Manual / default", meaning: "Preferred language for outreach content." },
  { field: "First touch", source: "Manual", meaning: "Starting channel for the cadence: Email, LinkedIn, or Cold call." },
  { field: "Ball", source: "Manual", meaning: "Shows whether the next action is on our side or the client's side." },
  { field: "Ping", source: "Automatic", meaning: "Date and freshness of the latest recorded outreach touch." },
  { field: "Node Research", source: "Manual / import", meaning: "Research notes about the target and company." },
  { field: "I Have Letters", source: "Manual / import", meaning: "Existing letters, context, or correspondence notes." },
  { field: "Status", source: "Manual / automatic", meaning: "Current target status. Campaign actions may update it." },
  { field: "Campaign", source: "Manual / automatic", meaning: "Selected outreach cadence for this target." },
  { field: "Campaign status", source: "Automatic", meaning: "Whether the selected campaign is active, stopped, or not started." },
  { field: "Touch", source: "Automatic", meaning: "Current cadence position, for example D+7 or Touch 3/8." },
  { field: "Next action", source: "Automatic", meaning: "Next planned outreach action generated from the current touch." },
  { field: "Calendar", source: "Linked calendar", meaning: "Calendar items connected to the outreach cadence." }
] as const;

const coldTargetFieldGuideByField: Map<string, (typeof coldTargetFieldGuideItems)[number]> = new Map(
  coldTargetFieldGuideItems.map((item) => [item.field, item])
);

function guideForColumn(column: Pick<CrmTableColumn, "id" | "title">, coldTarget = false) {
  const guide = coldTarget ? coldTargetFieldGuideByField : leadFieldGuideByField;
  return guide.get(column.title) ?? guide.get(column.id);
}

type OfferMissingFieldInput = {
  key: string;
  label: string;
  columnId: string;
  category: "price" | "document";
  placeholder: string;
  hint?: string;
};

const offerMissingFieldInputs: Record<string, OfferMissingFieldInput> = {
  bgf_or_manual_total_gross: {
    key: "bgf_or_manual_total_gross",
    label: "Project area / BGF",
    columnId: "area",
    category: "price",
    placeholder: "e.g. 140 m2",
    hint: "Or enter a manual gross price in Budget EUR."
  },
  project_type_or_manual_total_gross: {
    key: "project_type_or_manual_total_gross",
    label: "Project type",
    columnId: "description",
    category: "price",
    placeholder: "e.g. private house, renovation",
    hint: "A manual gross price can also unlock pricing."
  },
  manual_total_gross: {
    key: "manual_total_gross",
    label: "Manual gross price",
    columnId: "budgetEur",
    category: "price",
    placeholder: "e.g. 125000"
  },
  project_name: {
    key: "project_name",
    label: "Lead name",
    columnId: "projectName",
    category: "document",
    placeholder: "Project title"
  },
  project_address: {
    key: "project_address",
    label: "Project address",
    columnId: "address",
    category: "document",
    placeholder: "Street, city"
  },
  client_name: {
    key: "client_name",
    label: "Client name",
    columnId: "client.name",
    category: "document",
    placeholder: "Client name"
  },
  client_address_line_1: {
    key: "client_address_line_1",
    label: "Client address line 1",
    columnId: "offerFields.client_address_line_1",
    category: "document",
    placeholder: "Street, city"
  },
  client_address_line_2: {
    key: "client_address_line_2",
    label: "Client address line 2",
    columnId: "offerFields.client_address_line_2",
    category: "document",
    placeholder: "Optional"
  },
  project_type: {
    key: "project_type",
    label: "Project type",
    columnId: "offerFields.project_type",
    category: "document",
    placeholder: "e.g. EFH Neubau"
  }
};

const computedOfferTemplateFields = new Set([
  "date",
  "bgf",
  "wohnflaeche",
  "wohnflaecheLabel",
  "lp1_3_net",
  "lp4_net",
  "total_net",
  "mwst",
  "total_gross",
  "ms1_net",
  "ms2_net",
  "ms3_net",
  "pricing_mode",
  "offer_valid_until"
]);

const primaryOfferFormFieldKeys = [
  "client_name",
  "client_address_line_1",
  "client_address_line_2",
  "project_name",
  "project_address",
  "bgf_or_manual_total_gross",
  "project_type",
  "manual_total_gross"
];

const offerProjectTypeOptions = [
  { value: "EFH Neubau", label: "EFH Neubau / Einfamilienhaus", pricing: "auto" },
  { value: "Private house", label: "Private house", pricing: "auto" },
  { value: "Neubau", label: "Neubau", pricing: "auto" },
  { value: "Interior / Wohnung", label: "Interior / Wohnung", pricing: "manual" },
  { value: "Mehrfamilienhaus", label: "Mehrfamilienhaus", pricing: "manual" },
  { value: "Holiday park / Developer project", label: "Holiday park / Developer project", pricing: "manual" },
  { value: "Other", label: "Other", pricing: "manual" }
] as const;

function normalizeOfferTemplateField(value: string): string {
  return value.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
}

function offerTemplateInputForField(field: string): OfferMissingFieldInput | null {
  const key = normalizeOfferTemplateField(field);
  if (!key || computedOfferTemplateFields.has(key)) {
    return null;
  }
  const known = offerMissingFieldInputs[key];
  if (known) {
    return known;
  }
  return {
    key,
    label: humanOfferFieldName(key),
    columnId: `offerFields.${key}`,
    category: "document",
    placeholder: humanOfferFieldName(key)
  };
}

function offerMissingInputForField(field: string): OfferMissingFieldInput {
  return (
    offerMissingFieldInputs[field] ?? {
      key: field,
      label: humanOfferFieldName(field),
      columnId: field,
      category: "document",
      placeholder: humanOfferFieldName(field)
    }
  );
}

function offerFormFieldLabel(field: OfferMissingFieldInput): string {
  const labels: Record<string, string> = {
    client_name: "Client name",
    client_address_line_1: "Client address line 1",
    client_address_line_2: "Client address line 2",
    project_name: "Lead name",
    project_address: "Project address",
    bgf_or_manual_total_gross: "Project area / BGF",
    project_type: "Project type",
    manual_total_gross: "Manual gross price"
  };
  return labels[field.key] ?? field.label;
}

function offerProjectTypePricingHint(value: string | null | undefined): string {
  const selected = offerProjectTypeOptions.find((option) => option.value === value);
  if (selected?.pricing === "auto") {
    return "Auto price: needs BGF inside the active Honorartabelle range.";
  }
  if (selected?.pricing === "manual") {
    return "Manual price required for this project type.";
  }
  return "Choose a type: standard house types can use auto price; others need manual gross price.";
}

function formatOfferAreaInputValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const numeric = trimmed
    .replace(/\s*m(?:2|²)?\s*$/i, "")
    .replace(/[.\s']/g, "")
    .replace(",", ".");
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) {
    return trimmed;
  }
  return formatAreaValue(parsed);
}

function parseOfferNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (!value) {
    return null;
  }
  const match = value.match(/\d[\d\s.,']*/);
  if (!match) {
    return null;
  }
  const raw = match[0].replace(/[\s']/g, "");
  const normalized =
    raw.includes(".") && raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.includes(".") && /^\d{1,3}(?:\.\d{3})+$/.test(raw)
        ? raw.replace(/\./g, "")
        : raw.replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function isStandardOfferProjectType(value: string | null | undefined): boolean {
  const normalized = (value ?? "").toLocaleLowerCase();
  return ["efh", "einfamilienhaus", "private house", "neubau", "haus"].some((token) => normalized.includes(token));
}

function roundOfferCurrency(value: number): number {
  return Math.round(value);
}

function formatOfferCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} \u20AC`;
}

function formatOfferNumber(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: Number.isInteger(value) ? 0 : 1 })}${suffix}`;
}

function calculateOfferPreview(input: {
  bgf: number | null;
  projectType: string | null;
  manualTotalGross: number | null;
  feeRows: OfferFeeTableRow[];
}) {
  const wohnflaeche = input.bgf ? roundOfferCurrency(input.bgf * 0.75) : null;
  if (input.manualTotalGross) {
    const gross = roundOfferCurrency(input.manualTotalGross);
    const totalNet = roundOfferCurrency(gross / 1.19);
    return {
      status: "manual" as const,
      reason: "Manual gross price",
      bgf: input.bgf,
      wohnflaeche,
      wohnflaecheLabel: wohnflaeche ? `~${wohnflaeche}` : null,
      lp1_3Net: roundOfferCurrency(totalNet * 0.7),
      lp4Net: roundOfferCurrency(totalNet * 0.3),
      totalNet,
      mwst: roundOfferCurrency(gross - totalNet),
      totalGross: gross,
      ms1Net: roundOfferCurrency(totalNet * 0.3),
      ms2Net: roundOfferCurrency(totalNet * 0.4),
      ms3Net: roundOfferCurrency(totalNet * 0.3)
    };
  }
  if (!input.bgf) {
    return { status: "missing" as const, reason: "Need BGF or manual gross price" };
  }
  if (!input.projectType || !isStandardOfferProjectType(input.projectType)) {
    return { status: "missing" as const, reason: "Need standard project type or manual gross price", bgf: input.bgf, wohnflaeche };
  }
  const row = input.feeRows.find((candidate) => input.bgf && input.bgf >= candidate.bgfFrom && input.bgf <= candidate.bgfTo);
  if (!row) {
    return { status: "missing" as const, reason: "BGF is outside fee table; use manual gross price", bgf: input.bgf, wohnflaeche };
  }
  return {
    status: "auto" as const,
    reason: `Honorartabelle ${row.bgfFrom}-${row.bgfTo} m\u00B2`,
    bgf: input.bgf,
    wohnflaeche,
    wohnflaecheLabel: row.wohnflaecheLabel,
    lp1_3Net: row.lp1_3Net,
    lp4Net: row.lp4Net,
    totalNet: row.totalNet,
    mwst: row.vat,
    totalGross: row.totalGross,
    ms1Net: roundOfferCurrency(row.totalNet * 0.3),
    ms2Net: roundOfferCurrency(row.totalNet * 0.4),
    ms3Net: roundOfferCurrency(row.totalNet * 0.3)
  };
}

function humanOfferFieldName(value: string): string {
  const labels: Record<string, string> = {
    bgf: "project area / BGF",
    bgf_or_manual_total_gross: "project area / BGF or manual gross price",
    project_type_or_manual_total_gross: "project type or manual gross price",
    manual_total_gross: "manual gross price",
    project_name: "lead name",
    project_address: "project address",
    project_type: "project type",
    client_name: "client name",
    client_address_line_1: "client address line 1",
    client_address_line_2: "client address line 2"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function offerGenerationErrorMessage(payload: {
  error?: string;
  readiness?: { priceMissingFields?: string[]; documentMissingFields?: string[] };
}): string {
  const priceMissing = payload.readiness?.priceMissingFields ?? [];
  const documentMissing = payload.readiness?.documentMissingFields ?? [];
  if (priceMissing.length > 0) {
    return [
      "Offer price is not ready.",
      `Need for price: ${priceMissing.map(humanOfferFieldName).join(", ")}.`,
      documentMissing.length > 0 ? `Optional for document: ${documentMissing.map(humanOfferFieldName).join(", ")}.` : null
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ");
  }
  return payload.error ?? "Commercial offer generation failed.";
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
  "pingAt",
  "summaryShort",
  "summaryLong",
  "summaryUpdatedAt"
]);

function isMobileEditableColumn(column: CrmTableColumn): boolean {
  return !mobileReadonlyColumnIds.has(column.id) && column.valueKind !== "documents" && column.valueKind !== "calendar";
}

function isDetailsEditableColumn(column: CrmTableColumn): boolean {
  return (
    column.valueKind !== "documents" &&
    column.valueKind !== "calendar" &&
    ![
      "code",
      "summaryShort",
      "summaryLong",
      "summaryUpdatedAt",
      "offerMissingFields",
      "campaignName",
      "campaignTouch",
      "campaignStatus",
      "nextAction"
    ].includes(column.id) && column.valueKind !== "ping"
  );
}

const leadSecondaryFieldIds = new Set(["status"]);

function isLeadSecondaryColumn(column: CrmTableColumn): boolean {
  return leadSecondaryFieldIds.has(column.id);
}

function isMobileMultilineColumn(columnId: string): boolean {
  return [
    "description",
    "todo",
    "address",
    "notes",
    "rawInput",
    "role",
    "hook",
    "notesResearch",
    "archivedLetters",
    "nextAction",
    "summaryShort",
    "summaryLong",
    "offerMissingFields"
  ].includes(columnId);
}

function detailsTextareaRows(columnId: string, value: string | null | undefined): number {
  if (!isMobileMultilineColumn(columnId)) {
    return 1;
  }
  const text = String(value ?? "");
  const softWrapRows = Math.ceil(text.length / 72);
  const hardWrapRows = text.split(/\r\n|\r|\n/).length;
  const desiredRows = Math.max(2, softWrapRows, hardWrapRows);
  return Math.min(3, desiredRows);
}

function documentTypeIndex(documents: DocumentCellValue, documentIndex: number): number {
  const document = documents[documentIndex];
  if (!document) {
    return 0;
  }
  const extension = commercialOfferDocument(document) ? "KP" : documentExtensionLabel(document.fileName, document.mimeType);
  return documents
    .slice(0, documentIndex)
    .filter((previous) => (commercialOfferDocument(previous) ? "KP" : documentExtensionLabel(previous.fileName, previous.mimeType)) === extension).length;
}

function documentListDisplayLabel(documents: DocumentCellValue, documentIndex: number): string {
  const document = documents[documentIndex];
  if (!document) {
    return "File";
  }
  if (commercialOfferDocument(document)) {
    const version = document.shortSummary.match(/\bV(\d+)/i) ?? document.fileName.match(/\bV(\d+)/i);
    return version ? `KP V${version[1]}` : "KP";
  }
  return documentDisplayLabel(document.fileName, document.mimeType, documentTypeIndex(documents, documentIndex));
}

function documentCardSummary(document: DocumentCellItem): string {
  const summary = document.shortSummary?.replace(/\s+/g, " ").trim();
  if (!summary) {
    return "No summary yet";
  }
  if (!commercialOfferDocument(document)) {
    return summary;
  }
  return summary
    .replace(/^(commercial offer|kp)\s+v\d+\s*[:\-]\s*/i, "")
    .replace(/^(commercial offer|kp)\s*[:\-]\s*/i, "")
    .trim() || summary;
}

function commercialOfferDocument(document: DocumentCellItem): boolean {
  const haystack = [document.fileName, document.shortSummary, document.longSummary].filter(Boolean).join(" ").toLocaleLowerCase();
  return /\b(kp|commercial offer|angebot|honorar|gesamthonorar)\b/.test(haystack);
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

function formatDocumentCreatedAtShort(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatDocumentHistoryTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${pad(date.getFullYear() % 100)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function documentBadgeColor(extension: string): string {
  if (extension === "KP") {
    return "#7a6a46";
  }
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
      const extension = commercialOfferDocument(document) ? "KP" : documentExtensionLabel(document.fileName, document.mimeType);
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
        ctx.fillText(documentListDisplayLabel(documents, index), titleLeft, top + documentChipHeight / 2, chipWidth - (titleLeft - left) - 17);
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

const handoffCellRenderer: CustomRenderer<HandoffCustomCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is HandoffCustomCell =>
    cell.data && typeof cell.data === "object" && "kind" in cell.data && cell.data.kind === "handoff-cell",
  needsHover: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverAmount } = args;
    const side = cell.data.side;
    const progress = cell.data.progress;
    const from = cell.data.from;
    const to = cell.data.to;
    const displaySide = progress !== null && to ? to : side;
    const icon = handoffBallIcons[cell.data.ballType];
    const leftX = rect.x + 22;
    const rightX = rect.x + rect.width - 22;
    const centerY = rect.y + rect.height / 2;
    const railY = centerY + 8;
    const startX = from === "client" ? rightX : leftX;
    const endX = to === "client" ? rightX : leftX;
    const idleX = displaySide === "client" ? rightX : leftX;
    const eased = progress === null ? 1 : 1 - Math.pow(1 - progress, 3);
    const ballX = progress === null ? idleX : startX + (endX - startX) * eased;
    const arcLift = progress === null ? 0 : Math.sin(Math.PI * progress) * Math.min(18, rect.height * 0.42);
    const ballY = centerY - arcLift;
    const insightHover = displaySide === "us" && hoverAmount > 0;
    const activeTone = handoffSideTone(displaySide);

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

    ctx.strokeStyle = insightHover ? "rgba(245, 184, 75, 0.48)" : theme.borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, railY);
    ctx.quadraticCurveTo(rect.x + rect.width / 2, rect.y + 7, rightX, railY);
    ctx.stroke();

    for (const [label, x] of [
      ["us", leftX],
      ["client", rightX]
    ] as const) {
      const active = displaySide === label;
      ctx.fillStyle = active ? (label === "us" && insightHover ? "#d79316" : activeTone.accent) : theme.textMedium;
      ctx.font = "700 8px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label === "us" ? "us" : "client", x, railY, 26);
      if (active) {
        ctx.globalAlpha = label === "us" && insightHover ? 0.72 : 0.45;
        ctx.fillStyle = label === "us" && insightHover ? "#f5b84b" : activeTone.accent;
        ctx.beginPath();
        ctx.arc(x, railY + 10, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    if (displaySide === "us") {
      ctx.fillStyle = insightHover ? "#f5b84b" : theme.accentColor;
      ctx.font = "700 12px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(handoffInsightIcon, rect.x + 5, centerY - 1);
    }

    if (insightHover) {
      const glow = ctx.createRadialGradient(ballX, ballY, 2, ballX, ballY, 22);
      glow.addColorStop(0, "rgba(245, 184, 75, 0.36)");
      glow.addColorStop(1, "rgba(245, 184, 75, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ballX, ballY, 23, 0, Math.PI * 2);
      ctx.fill();
    } else if (displaySide === "client") {
      const glow = ctx.createRadialGradient(ballX, ballY, 2, ballX, ballY, 22);
      glow.addColorStop(0, activeTone.glow);
      glow.addColorStop(1, "rgba(217, 70, 143, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ballX, ballY, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = `${Math.max(17, Math.min(22, rect.height - 10))}px \"Segoe UI Emoji\", \"Apple Color Emoji\", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = insightHover ? "rgba(245, 184, 75, 0.72)" : displaySide === "client" ? activeTone.glow : "rgba(15, 23, 42, 0.22)";
    ctx.shadowBlur = insightHover ? 11 : displaySide === "client" ? 8 : 4;
    ctx.shadowOffsetY = insightHover ? 0 : 1;
    ctx.fillText(icon, ballX, ballY + (progress === null ? 0 : Math.sin(progress * Math.PI * 4) * 1.2));
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
  updateRecordIdField = "leadId",
  offerGenerateEndpoint,
  offerTemplateFields = [],
  offerFeeRows = [],
  outreachCampaigns = [],
  outreachStartEndpoint,
  outreachAdvanceEndpoint,
  outreachDraftEndpoint,
  outreachProtocolEndpoint,
  sendToTelegramEndpoint,
  clientOptionsEndpoint,
  clientLinkEndpoint,
  archiveEntity,
  createRecord
}: CrmTableProps) {
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const gridRef = useRef<DataEditorRef | null>(null);
  const gridFrameRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `lightcrm.table.${tableKey}`;
  const [preferences, setPreferences] = useState<TablePreferences>(() => defaultPreferences(columns));
  const [loadedPreferencesKey, setLoadedPreferencesKey] = useState<string | null>(null);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection>(() => emptySelection());
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showHandoffMenu, setShowHandoffMenu] = useState(false);
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
  const [handoffTooltip, setHandoffTooltip] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
    rowName: string;
  } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentCellItem | null>(null);
  const [cellDeleteTarget, setCellDeleteTarget] = useState<CellDeleteTarget | null>(null);
  const [isDeletingCellItem, setIsDeletingCellItem] = useState(false);
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDocumentUploadRowIdRef = useRef<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<DocumentUploadTarget | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ rowId: string; fileCount: number; percent: number } | null>(null);
  const [pendingDocumentUploads, setPendingDocumentUploads] = useState<Record<string, number>>({});
  const [uploadPulse, setUploadPulse] = useState(0);
  const [isGeneratingOffer, setIsGeneratingOffer] = useState(false);
  const [selectedOutreachCampaignId, setSelectedOutreachCampaignId] = useState<string>("");
  const [startingOutreachCampaign, setStartingOutreachCampaign] = useState(false);
  const [advancingOutreachCampaign, setAdvancingOutreachCampaign] = useState(false);
  const [outreachDrafts, setOutreachDrafts] = useState<Record<string, OutreachDraftState>>({});
  const [styledOutreachDrafts, setStyledOutreachDrafts] = useState<Record<string, boolean>>({});
  const [selectedOutreachOutcome, setSelectedOutreachOutcome] = useState("interested");
  const [outreachCampaignError, setOutreachCampaignError] = useState<string | null>(null);
  const [outreachProtocol, setOutreachProtocol] = useState<OutreachProtocolEntry[]>([]);
  const [outreachProtocolError, setOutreachProtocolError] = useState<string | null>(null);
  const [isSendingToTelegram, setIsSendingToTelegram] = useState(false);
  const [leadProgressFeedback, setLeadProgressFeedback] = useState<Record<string, { stageIndex: number; kind: "advance" | "complete" }>>({});
  const [leadProgressSavingRowId, setLeadProgressSavingRowId] = useState<string | null>(null);
  const [telegramSendNotice, setTelegramSendNotice] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [linkedTableColor, setLinkedTableColor] = useState(defaultTableColor);
  const [bulkActionDialog, setBulkActionDialog] = useState<BulkActionDialog>(null);
  const [archiveBlast, setArchiveBlast] = useState<{ key: number; count: number } | null>(null);
  const [mobileEditTarget, setMobileEditTarget] = useState<MobileEditTarget | null>(null);
  const [detailAnchorRowId, setDetailAnchorRowId] = useState<string | null>(null);
  const [detailsButtonPosition, setDetailsButtonPosition] = useState<DetailsButtonPosition | null>(null);
  const [clientPicker, setClientPicker] = useState<ClientPickerState | null>(null);
  const [hoveredClientPickerCell, setHoveredClientPickerCell] = useState<Item | null>(null);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [detailsPanel, setDetailsPanel] = useState<DetailsPanelState | null>(null);
  const [isCompactDetailsViewport, setIsCompactDetailsViewport] = useState(false);
  const [summaryHistoryTarget, setSummaryHistoryTarget] = useState<LeadSummaryHistoryTarget | null>(null);
  const [leadSummaryDraft, setLeadSummaryDraft] = useState<LeadSummaryDraft>({ shortSummary: "", longSummary: "", saving: false });
  const [longTextPreview, setLongTextPreview] = useState<LongTextPreview | null>(null);
  const [wrappedTextTooltip, setWrappedTextTooltip] = useState<WrappedTextTooltip | null>(null);
  const [archivingSummaryIds, setArchivingSummaryIds] = useState<Set<string>>(() => new Set());
  const [summaryArchiveConfirmId, setSummaryArchiveConfirmId] = useState<string | null>(null);
  const [copiedLeadCode, setCopiedLeadCode] = useState<string | null>(null);
  const [copiedOfferFieldsRowId, setCopiedOfferFieldsRowId] = useState<string | null>(null);
  const [handoffAnimations, setHandoffAnimations] = useState<
    Record<string, { from: "us" | "client"; to: "us" | "client"; progress: number }>
  >({});
  const lastHandoffClickRef = useRef<{ key: string; at: number } | null>(null);
  const initialDetailsOpenedRef = useRef<string | null>(null);
  const outreachDraftsRef = useRef(outreachDrafts);
  const outreachDraftAutosaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateRecordIdPayload = useCallback(
    (rowId: string) => ({ [updateRecordIdField]: rowId }),
    [updateRecordIdField]
  );

  useEffect(() => {
    outreachDraftsRef.current = outreachDrafts;
  }, [outreachDrafts]);

  useEffect(() => {
    const timers = outreachDraftAutosaveTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!showColumnMenu && !showHandoffMenu) {
      return;
    }
    function closeToolbarPopoversOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) {
        return;
      }
      setShowColumnMenu(false);
      setShowHandoffMenu(false);
    }
    document.addEventListener("mousedown", closeToolbarPopoversOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeToolbarPopoversOnOutsideClick);
  }, [showColumnMenu, showHandoffMenu]);
  const [mobileCalendarMonths, setMobileCalendarMonths] = useState<Record<string, string>>({});
  const mobileRowRefs = useRef(new Map<string, HTMLElement>());
  const isLeadTable = useMemo(
    () => columns.some((column) => column.id === "projectName") && columns.some((column) => column.id === "code"),
    [columns]
  );
  const isColdTargetTable = archiveEntity === "coldTarget";
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
  const tableRowHeight = useMemo(
    () =>
      columns.some((column) => shouldWrapTableColumn(column) || isWrappedAddressColumn(column))
        ? wrappedTableRowHeight(fontSizeFromTheme(activeTableTheme, 13))
        : undefined,
    [activeTableTheme, columns]
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
  const activeArchivedRowTheme = {
    regular: isDarkMode
      ? {
          bgCell: "#1f2326",
          bgCellMedium: "#252a2e",
          textDark: "#98a2ad",
          textMedium: "#727d88",
          accentColor: "#6f7782"
        }
      : {
          bgCell: "#f2f3f2",
          bgCellMedium: "#e6e8e6",
          textDark: "#747d77",
          textMedium: "#909993",
          accentColor: "#9aa19c"
        },
    spicy: isDarkMode
      ? {
          bgCell: "#241f20",
          bgCellMedium: "#302526",
          textDark: "#a69b9d",
          textMedium: "#887d80",
          accentColor: "#a96f64"
        }
      : {
          bgCell: "#efeeee",
          bgCellMedium: "#e0dddc",
          textDark: "#746d6c",
          textMedium: "#938a88",
          accentColor: "#a06a60"
        }
  };

  useEffect(() => {
    setEditableRows(rows);
    setDraftRowIds(new Set());
    setSavingDraftIds(new Set());
    setFlashRowId(null);
  }, [rows]);

  useEffect(() => {
    if (selectedOutreachCampaignId && outreachCampaigns.some((campaign) => campaign.id === selectedOutreachCampaignId)) {
      return;
    }
    setSelectedOutreachCampaignId(outreachCampaigns.find((campaign) => campaign.status === "active")?.id ?? outreachCampaigns[0]?.id ?? "");
  }, [outreachCampaigns, selectedOutreachCampaignId]);

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
    if (Object.keys(handoffAnimations).length === 0) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setHandoffAnimations((current) => {
        const next: typeof current = {};
        for (const [rowId, animation] of Object.entries(current)) {
          const progress = Math.min(1, animation.progress + 0.08);
          if (progress < 1) {
            next[rowId] = { ...animation, progress };
          }
        }
        return next;
      });
    }, 16);
    return () => window.clearInterval(intervalId);
  }, [handoffAnimations]);

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
  const countryOptions = useMemo(() => {
    if (!isColdTargetTable) {
      return [];
    }
    return Array.from(
      new Set(
        editableRows
          .map((row) => (typeof row.values.country === "string" ? row.values.country.trim() : ""))
          .filter(Boolean)
          .map(countryFilterLabel)
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [editableRows, isColdTargetTable]);
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
    return sortRows(filterRowsByCountry(searchedRows, countryFilter), sort);
  }, [countryFilter, editableRows, query, sort]);

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
    () => configuredColumns.filter((column) => isDetailsEditableColumn(column)),
    [configuredColumns]
  );
  const detailsModalColumns = useMemo(
    () =>
      configuredColumns.filter(
        (column) =>
          column.valueKind !== "documents" &&
          column.valueKind !== "calendar" &&
          column.group !== "Client" &&
          !["code", "summaryShort", "summaryLong", "summaryUpdatedAt", "offerMissingFields"].includes(column.id)
      ),
    [configuredColumns]
  );
  const detailsPrimaryColumns = useMemo(
    () =>
      detailsModalColumns.filter(
        (column) =>
          !(isLeadTable && isLeadSecondaryColumn(column)) &&
          !(isLeadTable && ["expectedFeeNet", "olegPercent", "olegCommissionEnabled"].includes(column.id))
      ),
    [detailsModalColumns, isLeadTable]
  );
  const detailsSecondaryColumns = useMemo(
    () => (isLeadTable ? detailsModalColumns.filter(isLeadSecondaryColumn) : []),
    [detailsModalColumns, isLeadTable]
  );
  const detailsPanelRow = detailsPanel ? editableRows.find((row) => row.id === detailsPanel.rowId) ?? null : null;
  const loadOutreachProtocol = useCallback(async (coldTargetId: string) => {
    if (!outreachProtocolEndpoint) {
      return;
    }
    setOutreachProtocolError(null);
    try {
      const query = new URLSearchParams({ workspaceId: "default", coldTargetId });
      const response = await fetch(`${outreachProtocolEndpoint}?${query.toString()}`);
      const payload = (await response.json()) as OutreachProtocolEntry[] | { error?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error((payload as { error?: string }).error ?? "Protocol load failed.");
      }
      setOutreachProtocol(payload);
    } catch (reason) {
      setOutreachProtocol([]);
      setOutreachProtocolError(reason instanceof Error ? reason.message : "Protocol load failed.");
    }
  }, [outreachProtocolEndpoint]);
  useEffect(() => {
    if (!isColdTargetTable || !detailsPanelRow || !outreachProtocolEndpoint) {
      setOutreachProtocol([]);
      setOutreachProtocolError(null);
      return;
    }
    void loadOutreachProtocol(detailsPanelRow.id);
  }, [detailsPanelRow?.id, isColdTargetTable, loadOutreachProtocol, outreachProtocolEndpoint]);
  const detailsPanelDocuments = detailsPanelRow ? sortDocumentsByAdded(cellDocuments(detailsPanelRow.values.documents)) : [];
  const detailsPanelVisibleDocuments = detailsPanelDocuments.slice(0, 3);
  const detailsPanelExtraDocuments = detailsPanelDocuments.slice(3);
  const detailsPanelCalendarItems = detailsPanelRow ? sortCalendarItemsByStart(cellCalendarItems(detailsPanelRow.values.calendar)) : [];
  const detailsPanelSummary = detailsPanelRow ? mobileLeadSummary(detailsPanelRow) : null;
  const detailsPanelOfferMissingFields = detailsPanelRow ? offerMissingFieldChips(detailsPanelRow.values.offerMissingFields) : [];
  const detailsOfferMissingInputs = detailsPanelOfferMissingFields.map(offerMissingInputForField);
  const detailsOfferPriceInputs = detailsOfferMissingInputs.filter((item) => item.category === "price");
  const detailsOfferDocumentInputs = [
    ...detailsOfferMissingInputs.filter((item) => item.category === "document"),
    ...offerTemplateFields.map(offerTemplateInputForField).filter((item): item is OfferMissingFieldInput => Boolean(item))
  ].filter((field, index, fields) => fields.findIndex((candidate) => candidate.key === field.key) === index);
  const detailsOfferFieldInputs = [...detailsOfferPriceInputs, ...detailsOfferDocumentInputs];
  const detailsOfferFormInputs = [
    ...primaryOfferFormFieldKeys.map(offerMissingInputForField),
    ...detailsOfferFieldInputs
  ].filter((field, index, fields) => fields.findIndex((candidate) => candidate.columnId === field.columnId) === index);
  const detailsOfferPreview = detailsPanel
    ? calculateOfferPreview({
        bgf: parseOfferNumber(detailsPanel.values.area),
        projectType:
          detailsPanel.values["offerFields.project_type"] ||
          detailsPanel.values.description ||
          detailsPanel.values.projectName ||
          detailsPanel.values.project ||
          null,
        manualTotalGross: parseOfferNumber(detailsPanel.values.budgetEur),
        feeRows: offerFeeRows
      })
    : { status: "missing" as const, reason: "Open a lead to calculate offer" };
  const detailsLeadSelectedStage = detailsPanelRow ? normalizeLeadProgressStage(detailsPanelRow.values.progressStage) : 0;
  const activeLeadProgressFeedback = detailsPanelRow ? leadProgressFeedback[detailsPanelRow.id] ?? null : null;
  const selectedOutreachCampaign =
    outreachCampaigns.find((campaign) => campaign.id === selectedOutreachCampaignId) ??
    outreachCampaigns.find((campaign) => campaign.status === "active") ??
    outreachCampaigns[0] ??
    null;
  const detailsOutreachProgress = parseOutreachTouchProgress(
    detailsPanelRow?.values.campaignTouch,
    selectedOutreachCampaign?.touchpoints.length
  );
  const detailsCurrentOutreachTouch =
    selectedOutreachCampaign && detailsOutreachProgress
      ? selectedOutreachCampaign.touchpoints.find((touch) => touch.touchNumber === detailsOutreachProgress.current) ?? null
      : null;
  const detailsOutreachProgressLabel = formatOutreachTouchProgressLabel(detailsOutreachProgress);
  const orderedOutreachTouchpoints = selectedOutreachCampaign
    ? orderOutreachTouchpoints(selectedOutreachCampaign.touchpoints, detailsOutreachProgress?.current)
    : [];
  const outreachChannelLabel = (channel: OutreachCampaignTouchpoint["channel"]) =>
    channel === "linkedin" ? "LinkedIn" : channel === "phone" ? "Cold call" : "Email";
  const detailsMarkSentLabel = formatOutreachTouchActionLabel(detailsOutreachProgress);
  const hasDetailsDocumentsSection = detailsPanelDocuments.length > 0 || columns.some((column) => column.id === "documents");
  const hasDetailsCalendarSection = detailsPanelCalendarItems.length > 0 || columns.some((column) => column.id === "calendar");
  const hasDetailsSideSections =
    isLeadTable || isColdTargetTable || hasDetailsDocumentsSection || hasDetailsCalendarSection || Boolean(detailsPanelSummary);
  const detailsModalEyebrow = isLeadTable ? "Lead card" : `${title.replace(/\s+table$/i, "").replace(/s$/i, "")} details`;
  const detailsModalTitle = detailsPanelRow
    ? String(mobileDisplayValue(detailsPanelRow.values.code) || mobileDisplayValue(detailsPanelRow.values.name) || detailsPanelRow.id)
    : "";
  const detailsModalSubtitle = detailsPanelRow
    ? String(
        mobileDisplayValue(detailsPanelRow.values.projectName) ||
          mobileDisplayValue(detailsPanelRow.values.company) ||
          mobileDisplayValue(detailsPanelRow.values.name) ||
          detailsPanelRow.id
      )
    : "";
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
      const isArchivedRow = rowIsArchived(record);
      const isFlashing = record?.id === flashRowId;
      const archivedTheme = isArchivedRow ? activeArchivedRowTheme[rowArchiveMood(record)] : undefined;
      const themeOverride = isFlashing ? activeDraftRowTheme.flash : isDraftRow ? activeDraftRowTheme.idle : archivedTheme;
      if (column?.valueKind === "calendar") {
        const items = visibleCalendarCellItems(cellCalendarItems(value));
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
        const isInlineText = isInlineLongTextColumn(column);
        return {
          kind: GridCellKind.Text,
          data: displayData,
          displayData,
          allowOverlay: isInlineText,
          readonly: !isInlineText,
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
      if (column?.valueKind === "handoff") {
        const animation = record ? handoffAnimations[record.id] : undefined;
        const side = normalizedHandoffSide(value);
        return {
          kind: GridCellKind.Custom,
          data: {
            kind: "handoff-cell",
            side,
            ballType: normalizedHandoffBall(preferences.handoffBall),
            progress: animation?.progress ?? null,
            from: animation?.from ?? null,
            to: animation?.to ?? null
          },
          copyData: side,
          allowOverlay: false,
          readonly: true,
          themeOverride: textThemeOverride(activeTableTheme, themeOverride, column.textStyle)
        };
      }
      const displayValue = value;
      const displayData = isArchivedRow && column?.id === "status"
        ? rowArchiveMood(record) === "spicy"
          ? "В утиле"
          : "Archived"
        : Array.isArray(displayValue)
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
    [activeArchivedRowTheme, activeDraftRowTheme, activeTableTheme, configuredColumns, draftRowIds, filteredRows, handoffAnimations, pendingDocumentUploads, preferences.handoffBall, uploadPulse]
  );

  const handleItemHovered = useCallback((args: GridMouseEventArgs) => {
    const frameBounds = gridFrameRef.current?.getBoundingClientRect();
    if (!frameBounds) {
      setRelatedTooltip(null);
      setDocumentTooltip(null);
      setCalendarTooltip(null);
      setHandoffTooltip(null);
      setWrappedTextTooltip(null);
      return;
    }
    if (args.kind === "group-header" && args.group === "Client") {
      setDocumentTooltip(null);
      setCalendarTooltip(null);
      setHandoffTooltip(null);
      setWrappedTextTooltip(null);
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
      const nextWrappedTextTooltip = wrappedCellTooltipForHover({
        column,
        row,
        bounds: args.bounds,
        frameBounds,
        theme: activeTableTheme
      });
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
      if (column?.valueKind === "handoff" && row) {
        const relativeTop = args.bounds.y - frameBounds.top;
        const showBelow = relativeTop < 76;
        setRelatedTooltip(null);
        setDocumentTooltip(null);
        setCalendarTooltip(null);
        setWrappedTextTooltip(null);
        setHandoffTooltip(
          normalizedHandoffSide(row.values[column.id]) === "us"
            ? {
                left: args.bounds.x - frameBounds.left + Math.min(Math.max(args.bounds.width / 2, 128), Math.max(128, args.bounds.width - 18)),
                top: showBelow ? relativeTop + args.bounds.height + 8 : Math.max(8, relativeTop - 8),
                placement: showBelow ? "below" : "above",
                rowName: String(row.values.projectName ?? row.values.name ?? row.values["client.name"] ?? "this record")
              }
            : null
        );
        return;
      }
      if (column?.valueKind === "calendar" && row) {
        const items = visibleCalendarCellItems(cellCalendarItems(row.values[column.id]));
        const relativeTop = args.bounds.y - frameBounds.top;
        const showBelow = relativeTop < 76;
        setRelatedTooltip(null);
        setDocumentTooltip(null);
        setHandoffTooltip(null);
        setWrappedTextTooltip(null);
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
          setHandoffTooltip(null);
          setWrappedTextTooltip(null);
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
      setWrappedTextTooltip(nextWrappedTextTooltip);
      if (nextWrappedTextTooltip) {
        setRelatedTooltip(null);
        setDocumentTooltip(null);
        setCalendarTooltip(null);
        setHandoffTooltip(null);
        return;
      }
    }
    setHoveredClientPickerCell(null);
    setRelatedTooltip(null);
    setDocumentTooltip(null);
    setCalendarTooltip(null);
    setHandoffTooltip(null);
    setWrappedTextTooltip(null);
  }, [activeTableTheme, clientOptionsEndpoint, configuredColumns, filteredRows, updateRecordEndpoint]);

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
      const movedId = visibleOrder[sourceIndex];
      if (!movedId) {
        return current;
      }
      const columnIds = columns.map((column) => column.id);
      const knownIds = new Set(columnIds);
      const baseOrder = [...(current.order ?? []), ...columnIds].filter((id, index, order) => knownIds.has(id) && order.indexOf(id) === index);
      const nextVisibleOrder = [...visibleOrder];
      nextVisibleOrder.splice(sourceIndex, 1);
      nextVisibleOrder.splice(Math.min(targetIndex, nextVisibleOrder.length), 0, movedId);

      const visibleIds = new Set(visibleOrder);
      const hiddenByAnchor = new Map<string | null, string[]>();
      let previousVisibleId: string | null = null;
      for (const id of baseOrder) {
        if (visibleIds.has(id)) {
          previousVisibleId = id;
          continue;
        }
        hiddenByAnchor.set(previousVisibleId, [...(hiddenByAnchor.get(previousVisibleId) ?? []), id]);
      }

      const order = [...(hiddenByAnchor.get(null) ?? [])];
      for (const id of nextVisibleOrder) {
        order.push(id, ...(hiddenByAnchor.get(id) ?? []));
      }
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
    async (row: CrmTableRow, patch: Record<string, string | number | boolean | null>, label = "Update field") => {
      if (!updateRecordEndpoint || row.id.startsWith("draft-")) {
        return;
      }
      try {
        const response = await fetch(updateRecordEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default",
            ...updateRecordIdPayload(row.id),
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
    [updateRecordEndpoint, updateRecordIdPayload]
  );

  const persistNextAction = useCallback(
    async (row: CrmTableRow, value: string) => {
      await persistInlinePatch(row, { todo: value.trim() ? value : null }, "Update next action");
    },
    [persistInlinePatch]
  );

  const playHandoffSound = useCallback((to: "us" | "client") => {
    try {
      if (preferences.handoffSoundEnabled === false) {
        return;
      }
      const ballType = normalizedHandoffBall(preferences.handoffBall);
      const preset = handoffSoundPresets[ballType];
      const audio = new Audio(preset.src);
      audio.volume = to === "us" ? 0.42 : 0.36;
      void audio.play();
    } catch {
      // Audio feedback is intentionally best-effort.
    }
  }, [preferences.handoffBall, preferences.handoffSoundEnabled]);

  const persistLeadProgressStage = useCallback(
    async (row: CrmTableRow, selectedStage: number) => {
      if (!updateRecordEndpoint || row.id.startsWith("draft-")) {
        return false;
      }
      const progressStage = normalizeLeadProgressStage(selectedStage);
      setLeadProgressSavingRowId(row.id);
      try {
        const response = await fetch(updateRecordEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildLeadProgressUpdateRequest(updateRecordIdField, row.id, progressStage))
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Lead progress update failed.");
        }
        setEditableRows((current) => updateRowCell(current, row.id, "progressStage", progressStage));
        setLeadProgressFeedback((current) => ({
          ...current,
          [row.id]: {
            stageIndex: progressStage,
            kind: progressStage === leadProgressFinalStageIndex ? "complete" : "advance"
          }
        }));
        window.setTimeout(() => {
          setLeadProgressFeedback((current) => {
            if (!current[row.id] || current[row.id]?.stageIndex !== progressStage) {
              return current;
            }
            const next = { ...current };
            delete next[row.id];
            return next;
          });
        }, progressStage === leadProgressFinalStageIndex ? 900 : 620);
        setCreateError(null);
        return true;
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : "Lead progress update failed.");
        return false;
      } finally {
        setLeadProgressSavingRowId((current) => (current === row.id ? null : current));
      }
    },
    [updateRecordEndpoint, updateRecordIdField]
  );

  const setDetailsValue = useCallback((columnId: string, value: string) => {
    setDetailsPanel((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              [columnId]: value
            }
          }
        : current
    );
  }, []);

  const toggleDetailsHandoffBall = useCallback(() => {
    if (!detailsPanel || !detailsPanelRow) {
      return;
    }
    const from = normalizedHandoffSide(detailsPanel.values.ballSide ?? detailsPanelRow.values.ballSide);
    const to = from === "us" ? "client" : "us";
    setDetailsValue("ballSide", to);
    setHandoffAnimations((current) => ({ ...current, [detailsPanel.rowId]: { from, to, progress: 0 } }));
    playHandoffSound(to);
  }, [detailsPanel, detailsPanelRow, playHandoffSound, setDetailsValue]);

  const toggleHandoffBall = useCallback(
    (row: CrmTableRow, column: CrmTableColumn) => {
      const from = normalizedHandoffSide(row.values[column.id]);
      const to = from === "us" ? "client" : "us";
      setEditableRows((current) => updateRowCell(current, row.id, column.id, to));
      setHandoffAnimations((current) => ({ ...current, [row.id]: { from, to, progress: 0 } }));
      playHandoffSound(to);
      void persistInlinePatch(row, { [column.id]: to }, `Update ${column.title}`);
    },
    [persistInlinePatch, playHandoffSound]
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
      if (column.valueKind === "ping") {
        return;
      }
      if (column.valueKind === "currentTouch") {
        return;
      }
      if (isLeadTable && (column.id === "expectedFeeNet" || column.id === "olegPercent")) {
        const rawValue = String(value.data ?? "").trim();
        const numericValue = rawValue ? Number(rawValue.replace(",", ".")) : null;
        setEditableRows((current) => updateRowCell(current, row.id, column.id, value.data));
        void persistInlinePatch(
          row,
          { [column.id]: numericValue !== null && Number.isFinite(numericValue) ? numericValue : null },
          `Update ${column.title}`
        );
        return;
      }
      const nextRow = {
        ...row,
        values: { ...row.values, [column.id]: value.data }
      };
      setEditableRows((current) => updateRowCell(current, row.id, column.id, value.data));
      if (draftRowIds.has(row.id)) {
        void saveDraftRow(nextRow);
      } else if (column.id.startsWith("client.")) {
        void persistInlinePatch(row, { [column.id]: String(value.data ?? "").trim() ? String(value.data ?? "") : null }, `Update ${column.title}`);
      } else if (persistInlineNoteField(row, column, String(value.data ?? ""))) {
        return;
      } else if (createRecord?.fields.some((field) => field.id === column.id)) {
        void persistEditedRow(nextRow);
      }
    },
    [configuredColumns, createRecord, draftRowIds, filteredRows, isLeadTable, persistEditedRow, persistInlineNoteField, persistInlinePatch, persistNextAction, saveDraftRow]
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

  const renderDownloadsUploadInlineStatus = useCallback(
    (rowId: string) => {
      if (!uploadProgress || uploadProgress.rowId !== rowId) {
        return null;
      }
      return (
        <span
          className="downloadsUploadInlineStatus"
          title={`Adding ${uploadProgress.fileCount} ${uploadProgress.fileCount === 1 ? "file" : "files"}: ${uploadProgress.percent}%`}
        >
          <span className="downloadsUploadInlineDot" aria-hidden="true" />
          <span>{uploadProgress.percent}%</span>
        </span>
      );
    },
    [uploadProgress]
  );

  const openDocumentUploadForRow = useCallback(
    (rowId: string) => {
      if (!documentUploadEndpoint) {
        setCreateError("Document upload is not available for this table.");
        return;
      }
      pendingDocumentUploadRowIdRef.current = rowId;
      setUploadTarget({ rowId, files: [] });
      setUploadError(null);
      setUploadSuccess(null);
      setCreateError(null);
      window.setTimeout(() => uploadFileInputRef.current?.click(), 0);
    },
    [documentUploadEndpoint]
  );

  const handleCellClicked = useCallback(
    ([columnIndex, rowIndex]: Item, event: Parameters<NonNullable<ComponentProps<typeof DataEditor>["onCellClicked"]>>[1]) => {
      const column = configuredColumns[columnIndex];
      const row = filteredRows[rowIndex];
      if (!column || !row) {
        return;
      }
      setDetailAnchorRowId(row.id);
      if (column.valueKind === "handoff") {
        event.preventDefault();
        const key = `${row.id}:${column.id}`;
        const now = Date.now();
        const previous = lastHandoffClickRef.current;
        lastHandoffClickRef.current = { key, at: now };
        if (previous?.key === key && now - previous.at < 420) {
          toggleHandoffBall(row, column);
          lastHandoffClickRef.current = null;
        }
        return;
      }
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
        const items = visibleCalendarCellItems(cellCalendarItems(row.values[column.id]));
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
      if (column.valueKind === "longText" && !isInlineLongTextColumn(column)) {
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
        openDocumentUploadForRow(row.id);
      }
    },
    [configuredColumns, filteredRows, openDocumentUploadForRow, toggleHandoffBall]
  );

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

  const uploadDocumentsForRow = useCallback(
    (rowId: string, files: File[]) => {
      if (!documentUploadEndpoint) {
        setCreateError("Document upload is not available for this table.");
        return;
      }
      if (files.length === 0) {
        return;
      }
      const body = new FormData();
      body.set("leadId", rowId);
      body.set("sourceChannel", "web");
      files.forEach((file) => {
        body.append("files", file);
      });
      const uploadRowId = rowId;
      const uploadCount = files.length;
      setPendingDocumentUploads((current) => ({ ...current, [uploadRowId]: (current[uploadRowId] ?? 0) + uploadCount }));
      setUploadError(null);
      setUploadSuccess(null);
      setCreateError(null);
      setUploadProgress({ rowId: uploadRowId, fileCount: uploadCount, percent: 0 });
      setUploadTarget(null);
      pendingDocumentUploadRowIdRef.current = null;
      if (uploadFileInputRef.current) {
        uploadFileInputRef.current.value = "";
      }

      const request = new XMLHttpRequest();
      request.open("POST", documentUploadEndpoint);
      request.upload.addEventListener("loadstart", () => {
        setUploadProgress({ rowId: uploadRowId, fileCount: uploadCount, percent: 3 });
      });
      request.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable || event.total === 0) {
          return;
        }
        const percent = Math.min(92, Math.max(3, Math.round((event.loaded / event.total) * 90)));
        setUploadProgress({ rowId: uploadRowId, fileCount: uploadCount, percent });
      });
      request.upload.addEventListener("load", () => {
        setUploadProgress({ rowId: uploadRowId, fileCount: uploadCount, percent: 94 });
      });
      request.addEventListener("load", () => {
        try {
          let payload: { documents?: DocumentCellValue; error?: string } = {};
          if (request.responseText.trim()) {
            try {
              payload = JSON.parse(request.responseText) as { documents?: DocumentCellValue; error?: string };
            } catch {
              throw new Error(request.status >= 200 && request.status < 300 ? "Upload returned an invalid response." : "Server returned a non-JSON response.");
            }
          }
          if (request.status < 200 || request.status >= 300) {
            throw new Error(payload.error ?? "Upload failed.");
          }
          const uploaded = payload.documents ?? [];
          if (uploaded.length > 0) {
            setEditableRows((current) =>
              current.map((row) =>
                row.id === uploadRowId
                  ? {
                      ...row,
                      values: {
                        ...row.values,
                        documents: [...uploaded, ...cellDocuments(row.values.documents)]
                      }
                    }
                  : row
              )
            );
          }
          setUploadProgress({ rowId: uploadRowId, fileCount: uploadCount, percent: 100 });
          setUploadSuccess(
            uploaded.length === 1
              ? "Upload complete: 1 document added."
              : `Upload complete: ${uploaded.length} documents added.`
          );
          window.setTimeout(() => setUploadProgress(null), 900);
        } catch (error) {
          setUploadProgress(null);
          setUploadError(error instanceof Error ? `Upload failed: ${error.message}` : "Upload failed.");
        } finally {
          decrementPendingDocumentUploads(uploadRowId, uploadCount);
        }
      });
      request.addEventListener("error", () => {
        setUploadProgress(null);
        setUploadError("Upload failed: network error.");
        decrementPendingDocumentUploads(uploadRowId, uploadCount);
      });
      request.send(body);
    },
    [decrementPendingDocumentUploads, documentUploadEndpoint]
  );

  const handleDocumentFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      setUploadTarget(null);
      return;
    }
    const rowId = uploadTarget?.rowId ?? pendingDocumentUploadRowIdRef.current;
    if (!rowId) {
      setCreateError("Upload failed: choose a Documents cell first.");
      if (uploadFileInputRef.current) {
        uploadFileInputRef.current.value = "";
      }
      return;
    }
    uploadDocumentsForRow(rowId, files);
  }, [uploadDocumentsForRow, uploadTarget?.rowId]);

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

  const copyOfferMissingFields = useCallback(async (row: CrmTableRow) => {
    const fields = offerMissingFieldChips(row.values.offerMissingFields);
    const text =
      fields.length > 0
        ? `Missing for offer: ${fields.join(", ")}`
        : "Missing for offer: no missing fields detected.";
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
    setCopiedOfferFieldsRowId(row.id);
    window.setTimeout(() => {
      setCopiedOfferFieldsRowId((current) => (current === row.id ? null : current));
    }, 1600);
  }, []);

  const cancelMobileEdit = useCallback(() => {
    setMobileEditTarget(null);
  }, []);

  const selectClientInDetails = useCallback((client: ClientOption) => {
    setDetailsPanel((current) =>
      current
        ? {
            ...current,
            selectedClientId: client.id,
            clientPickerOpen: false,
            values: {
              ...current.values,
              "client.name": client.name ?? "",
              "client.phone": client.phone ?? "",
              "client.email": client.email ?? "",
              messenger: client.whatsapp ?? current.values.messenger ?? ""
            }
          }
        : current
    );
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
          ...updateRecordIdPayload(rowId),
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
  }, [mobileEditTarget, updateRecordEndpoint, updateRecordIdPayload]);

  const openDetailsPanel = useCallback((row: CrmTableRow) => {
    const offerFieldIds = [
      ...offerMissingFieldChips(row.values.offerMissingFields).map(offerMissingInputForField),
      ...offerTemplateFields.map(offerTemplateInputForField).filter((item): item is OfferMissingFieldInput => Boolean(item))
    ].map((field) => field.columnId);
    const detailFieldIds = new Set([
      ...detailsEditableColumns.map((column) => column.id),
      "client.name",
      "client.phone",
      "client.email",
      "budgetEur",
      "offerMissingFields",
      ...offerFieldIds
    ]);
    const values = Object.fromEntries(
      [...detailFieldIds].map((fieldId) => {
        const value = mobileDisplayValue(row.values[fieldId]);
        return [fieldId, value === "n/a" ? "" : String(value)];
      })
    );
    const selectedClient =
      clientOptions.find((client) => {
        const clientName = (client.name ?? "").trim().toLowerCase();
        const valueName = (values["client.name"] ?? "").trim().toLowerCase();
        const clientPhone = (client.phone ?? "").trim();
        const valuePhone = (values["client.phone"] ?? "").trim();
        const clientEmail = (client.email ?? "").trim().toLowerCase();
        const valueEmail = (values["client.email"] ?? "").trim().toLowerCase();
        if (valueEmail && clientEmail === valueEmail) {
          return true;
        }
        if (valuePhone && clientPhone === valuePhone) {
          return true;
        }
        return Boolean(valueName && clientName === valueName);
      }) ?? null;
    setDetailsPanel({ rowId: row.id, values, clientPickerOpen: false, selectedClientId: selectedClient?.id ?? null, saving: false });
  }, [clientOptions, detailsEditableColumns, offerTemplateFields]);

  useEffect(() => {
    if (!initialFocusRowId || !updateRecordEndpoint || initialDetailsOpenedRef.current === initialFocusRowId) {
      return;
    }
    const row = filteredRows.find((candidate) => candidate.id === initialFocusRowId);
    if (!row) {
      return;
    }
    initialDetailsOpenedRef.current = initialFocusRowId;
    setDetailAnchorRowId(row.id);
    openDetailsPanel(row);
  }, [filteredRows, initialFocusRowId, openDetailsPanel, updateRecordEndpoint]);

  const saveDetailsPanelChanges = useCallback(async (options: { closePanel?: boolean } = {}) => {
    const closePanel = options.closePanel ?? true;
    if (!detailsPanel || !detailsPanelRow || !updateRecordEndpoint || detailsPanel.saving) {
      return false;
    }
    const offerDetailInputs = detailsOfferFormInputs;
    const saveColumns = [
      ...detailsEditableColumns.filter((column) => column.group !== "Client" && !column.id.startsWith("client.")),
      ...(["budgetEur"] as const).map((id) => ({ id, title: id }) as CrmTableColumn),
      ...offerDetailInputs.map((field) => ({ id: field.columnId, title: field.label }) as CrmTableColumn)
    ].filter((column, index, list) => list.findIndex((candidate) => candidate.id === column.id) === index);
    const flatPatch = Object.fromEntries(
      saveColumns
        .map((column) => {
          const currentValue = mobileDisplayValue(detailsPanelRow.values[column.id]);
          const currentText = currentValue === "n/a" ? "" : String(currentValue);
          const nextText = detailsPanel.values[column.id] ?? "";
          return currentText === nextText ? null : [column.id, nextText.trim() ? nextText : null];
        })
        .filter((entry): entry is [string, string | null] => Boolean(entry))
    );
    const offerFields = Object.fromEntries(
      Object.entries(flatPatch)
        .filter(([columnId]) => columnId.startsWith("offerFields."))
        .map(([columnId, value]) => [columnId.slice("offerFields.".length), value])
    );
    const patch: Record<string, string | null | Record<string, string | null>> = Object.fromEntries(
      Object.entries(flatPatch).filter(([columnId]) => !columnId.startsWith("offerFields."))
    );
    if (Object.keys(offerFields).length > 0) {
      patch.offerFields = offerFields;
    }
    if (detailsPanel.selectedClientId) {
      patch.clientId = detailsPanel.selectedClientId;
    }

    if (Object.keys(patch).length === 0) {
      if (closePanel) {
        setDetailsPanel(null);
      }
      return true;
    }

    setDetailsPanel((current) => (current ? { ...current, saving: true } : current));
    try {
      const response = await fetch(updateRecordEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          ...updateRecordIdPayload(detailsPanel.rowId),
          patch,
          source: { channel: "web-details" }
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Details update failed.");
      }
      const selectedClient = detailsPanel.selectedClientId
        ? clientOptions.find((client) => client.id === detailsPanel.selectedClientId) ?? null
        : null;
      setEditableRows((current) =>
        Object.entries(flatPatch)
          .filter(([columnId]) => columnId !== "clientId")
          .filter((entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null)
          .reduce((rows, [columnId, value]) => updateRowCell(rows, detailsPanel.rowId, columnId, value ?? ""), current)
          .map((row) =>
            row.id === detailsPanel.rowId && selectedClient
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    "client.name": selectedClient.name ?? "",
                    "client.phone": selectedClient.phone ?? "",
                    "client.email": selectedClient.email ?? "",
                    messenger: selectedClient.whatsapp ?? row.values.messenger
                  }
                }
              : row
          )
      );
      setCreateError(null);
      if (closePanel) {
        setDetailsPanel(null);
      } else {
        setDetailsPanel((current) => (current ? { ...current, saving: false } : current));
      }
      return true;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Details update failed.");
      setDetailsPanel((current) => (current ? { ...current, saving: false } : current));
      return false;
    }
  }, [
    detailsEditableColumns,
    detailsOfferFormInputs,
    detailsPanel,
    detailsPanelRow,
    clientOptions,
    updateRecordEndpoint,
    updateRecordIdPayload
  ]);

  const saveDetailsPanel = useCallback(async () => {
    await saveDetailsPanelChanges({ closePanel: true });
  }, [saveDetailsPanelChanges]);

  const selectClientForLead = useCallback(
    async (client: ClientOption) => {
      if (!clientPicker || (!clientLinkEndpoint && !updateRecordEndpoint) || clientPicker.saving) {
        return;
      }
      setClientPicker((current) => (current ? { ...current, saving: true, error: null } : current));
      try {
        const endpoint = clientLinkEndpoint ?? updateRecordEndpoint;
        if (!endpoint) {
          return;
        }
        const body = clientLinkEndpoint
          ? {
              workspaceId: "default",
              leadId: clientPicker.rowId,
              clientId: client.id
            }
          : {
              workspaceId: "default",
              leadId: clientPicker.rowId,
              patch: { clientId: client.id },
              source: { channel: "web-client-picker" }
            };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
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
                    clientId: client.id,
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
    [clientLinkEndpoint, clientPicker, updateRecordEndpoint]
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

      if (column?.valueKind === "ping" && args.cell.kind === GridCellKind.Text) {
        const row = filteredRows[args.row];
        const pingValue = row?.values.pingAt;
        const tone = coldTargetPingTone(typeof pingValue === "string" ? pingValue : null);
        const label = coldTargetPingLabel(typeof pingValue === "string" ? pingValue : null);
        const { ctx, rect, theme } = args;
        const colors = {
          fresh: { fill: isDarkMode ? "#203c2b" : "#e6f5eb", text: isDarkMode ? "#bfe8c9" : "#24653a", dot: "#3d9b5f" },
          overdue: { fill: isDarkMode ? "#4a3a1e" : "#fff2ce", text: isDarkMode ? "#ffe1a0" : "#805b06", dot: "#d49a24" },
          dormant: { fill: isDarkMode ? "#302f33" : "#e8e8eb", text: isDarkMode ? "#d6d2dc" : "#4b4b54", dot: "#393942" }
        }[tone];
        ctx.save();
        const chipHeight = Math.max(18, Math.min(rect.height - 8, 24));
        const chipWidth = Math.min(rect.width - 12, Math.max(72, label.length * 7 + 30));
        const chipX = rect.x + Math.max(6, (rect.width - chipWidth) / 2);
        const chipY = rect.y + (rect.height - chipHeight) / 2;
        ctx.beginPath();
        ctx.roundRect(chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
        ctx.fillStyle = colors.fill;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(chipX + 11, rect.y + rect.height / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = colors.dot;
        ctx.fill();
        ctx.font = `600 11px ${theme.fontFamily ?? "Inter, sans-serif"}`;
        ctx.fillStyle = colors.text;
        ctx.textBaseline = "middle";
        ctx.fillText(label, chipX + 19, rect.y + rect.height / 2, chipWidth - 24);
        ctx.restore();
        drawSearchMatchHighlight(args, query, isDarkMode);
        return;
      }

      if (column?.valueKind === "currentTouch" && args.cell.kind === GridCellKind.Text) {
        const row = filteredRows[args.row];
        const tone = currentTouchChipTone(row?.values[column.id]);
        if (!tone) {
          drawContent();
          drawSearchMatchHighlight(args, query, isDarkMode);
          return;
        }
        const text = args.cell.displayData || args.cell.data || "";
        const { ctx, rect, theme } = args;
        ctx.save();
        const chipHeight = Math.max(18, Math.min(rect.height - 8, 24));
        const chipWidth = Math.min(rect.width - 12, Math.max(72, String(text).length * 7 + 30));
        const chipX = rect.x + Math.max(6, (rect.width - chipWidth) / 2);
        const chipY = rect.y + (rect.height - chipHeight) / 2;
        ctx.beginPath();
        ctx.roundRect(chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
        ctx.fillStyle = isDarkMode ? "#162b4c" : tone.fill;
        ctx.fill();
        ctx.strokeStyle = isDarkMode ? "#2d63be" : tone.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(chipX + 11, rect.y + rect.height / 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = tone.dot;
        ctx.fill();
        ctx.font = `700 11px ${theme.fontFamily ?? "Inter, sans-serif"}`;
        ctx.fillStyle = isDarkMode ? "#b8d3ff" : tone.text;
        ctx.textBaseline = "middle";
        ctx.fillText(String(text), chipX + 19, rect.y + rect.height / 2, chipWidth - 24);
        ctx.restore();
        drawSearchMatchHighlight(args, query, isDarkMode);
        return;
      }

      if (args.cell.kind === GridCellKind.Text && (isInlineLongTextColumn(column) || isWrappedAddressColumn(column))) {
        const text = args.cell.displayData || args.cell.data || "";
        const mutableCell = args.cell as typeof args.cell & { displayData?: string; data?: string };
        const originalDisplayData = mutableCell.displayData;
        const originalData = mutableCell.data;
        mutableCell.displayData = "";
        mutableCell.data = "";
        drawContent();
        mutableCell.displayData = originalDisplayData;
        mutableCell.data = originalData;
        drawWrappedTextCell(
          args,
          text,
          isWrappedAddressColumn(column) ? { maxLines: 2, ellipsis: true } : undefined
        );
        drawSearchMatchHighlight(args, query, isDarkMode);
        if (column?.group !== "Client") {
          return;
        }
      } else {
        drawContent();
        drawSearchMatchHighlight(args, query, isDarkMode);
        if (column?.group !== "Client") {
          return;
        }
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

  const confirmArchiveSelectedRows = useCallback(
    async (mood: ArchiveMood) => {
      if (!archiveEntity || selectedRows.length === 0) {
        setBulkActionDialog(null);
        return;
      }
      const selectedIds = new Set(selectedRows.map((row) => row.id));
      if (mood === "spicy") {
        setArchiveBlast({ key: Date.now(), count: selectedRows.length });
      }
      const response = await fetch("/api/crm/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: archiveEntity, ids: [...selectedIds], mood })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setCreateError(payload.error ? `Archive failed: ${payload.error}` : "Archive failed.");
        setBulkActionDialog(null);
        setArchiveBlast(null);
        return;
      }
      const payload = (await response.json()) as { archived?: ApiRecord[] };
      const archivedRows = new Map((payload.archived ?? []).map((record) => [record.id, recordToRow(record, columns)]));
      const fallbackArchivedAt = new Date().toISOString();
      setEditableRows((current) =>
        current.map((row) => {
          const archivedRow = archivedRows.get(row.id);
          if (archivedRow) {
            return archivedRow;
          }
          if (!selectedIds.has(row.id)) {
            return row;
          }
          return {
            ...row,
            values: {
              ...row.values,
              status: "archived",
              archivedAt: fallbackArchivedAt,
              archiveMood: mood
            }
          };
        })
      );
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
      window.setTimeout(() => setArchiveBlast(null), 1450);
    },
    [archiveEntity, columns, selectedRows]
  );

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

  const generateOfferForRow = useCallback(async (row: CrmTableRow) => {
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
      const payload = (await response.json()) as {
        document?: DocumentCellItem;
        error?: string;
        readiness?: { priceMissingFields?: string[]; documentMissingFields?: string[] };
      };
      if (!response.ok || !payload.document) {
        throw new Error(offerGenerationErrorMessage(payload));
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
      setPreviewDocument(document);
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Commercial offer generation failed.");
    } finally {
      setIsGeneratingOffer(false);
    }
  }, [isGeneratingOffer, offerGenerateEndpoint]);

  const generateOfferForSelectedRow = useCallback(async () => {
    const row = selectedRows[0];
    if (!row) {
      return;
    }
    await generateOfferForRow(row);
  }, [generateOfferForRow, selectedRows]);

  const generateOfferForDetailsRow = useCallback(async () => {
    if (!detailsPanelRow) {
      return;
    }
    const saved = await saveDetailsPanelChanges({ closePanel: false });
    if (!saved) {
      return;
    }
    await generateOfferForRow(detailsPanelRow);
  }, [detailsPanelRow, generateOfferForRow, saveDetailsPanelChanges]);

  const applyOutreachResponseToRow = useCallback((rowId: string, payload: {
    rowPatch?: Record<string, string | null>;
    calendarItem?: CalendarCellItem | null;
    calendarItems?: CalendarCellItem[];
    outreachProtocolItems?: OutreachProtocolItem[];
  }) => {
    setEditableRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const patchedValues: Record<string, CrmTableCellValue> = { ...row.values };
        Object.entries(payload.rowPatch ?? {}).forEach(([key, value]) => {
          patchedValues[key] = value ?? "";
        });
        const nextCalendarItems = payload.calendarItems ?? (payload.calendarItem ? [payload.calendarItem] : []);
        if (nextCalendarItems.length > 0) {
          const existingItems = cellCalendarItems(row.values.calendar);
          patchedValues.calendar = [
            ...existingItems.filter(
              (item) => !nextCalendarItems.some((nextItem) => nextItem.kind === item.kind && nextItem.id === item.id)
            ),
            ...nextCalendarItems
          ];
        }
        if (payload.outreachProtocolItems && payload.outreachProtocolItems.length > 0) {
          const existingProtocolItems = cellOutreachProtocol(row.values.outreachProtocol);
          patchedValues.outreachProtocol = [
            ...payload.outreachProtocolItems,
            ...existingProtocolItems.filter(
              (item) => !payload.outreachProtocolItems?.some((nextItem) => nextItem.id === item.id)
            )
          ];
        }
        return { ...row, values: patchedValues };
      })
    );
  }, []);

  const loadOutreachDraftForDetailsRow = useCallback(
    async (touch: OutreachCampaignTouchpoint, options?: { force?: boolean }) => {
      if (!detailsPanelRow || !selectedOutreachCampaign || !outreachDraftEndpoint) {
        return;
      }
      const key = outreachDraftKey(detailsPanelRow.id, selectedOutreachCampaign.id, touch.id);
      const existing = outreachDrafts[key];
      if (!options?.force && existing && (existing.loading || (!existing.error && existing.body))) {
        return;
      }
      setOutreachDrafts((current) => ({
        ...current,
        [key]: {
          subject: existing?.subject ?? "",
          body: existing?.body ?? "",
          reminderId: existing?.reminderId,
          channel: existing?.channel ?? touch.channel,
          dueAt: existing?.dueAt ?? null,
          status: existing?.status ?? null,
          action: existing?.action ?? touch.action,
          email: existing?.email ?? null,
          loading: true,
          saving: false,
          dirty: existing?.dirty ?? false,
          savedSubject: existing?.savedSubject ?? existing?.subject ?? "",
          savedBody: existing?.savedBody ?? existing?.body ?? "",
          message: null,
          error: null
        }
      }));
      try {
        const response = await fetch(outreachDraftEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default",
            coldTargetId: detailsPanelRow.id,
            campaignId: selectedOutreachCampaign.id,
            touchId: touch.id,
            force: Boolean(options?.force)
          })
        });
        const payload = (await response.json()) as {
          error?: string;
          draft?: Omit<OutreachDraftState, "loading" | "error">;
          calendarItem?: CalendarCellItem;
        };
        if (!response.ok || !payload.draft) {
          throw new Error(payload.error ?? "Draft creation failed.");
        }
        const draft = payload.draft;
        setOutreachDrafts((current) => ({
          ...current,
          [key]: {
            ...draft,
            loading: false,
            dirty: false,
            savedSubject: draft.subject,
            savedBody: draft.body,
            error: null
          }
        }));
        applyOutreachResponseToRow(detailsPanelRow.id, { calendarItem: payload.calendarItem ?? null });
      } catch (reason) {
        setOutreachDrafts((current) => ({
          ...current,
          [key]: {
            subject: existing?.subject ?? "",
            body: existing?.body ?? "",
            reminderId: existing?.reminderId,
            channel: existing?.channel ?? touch.channel,
            dueAt: existing?.dueAt ?? null,
            status: existing?.status ?? null,
            action: existing?.action ?? touch.action,
            email: existing?.email ?? null,
            loading: false,
            saving: false,
            dirty: existing?.dirty ?? false,
            savedSubject: existing?.savedSubject ?? existing?.subject ?? "",
            savedBody: existing?.savedBody ?? existing?.body ?? "",
            message: null,
            error: reason instanceof Error ? reason.message : "Draft creation failed."
          }
        }));
      }
    },
    [applyOutreachResponseToRow, detailsPanelRow, outreachDraftEndpoint, outreachDrafts, selectedOutreachCampaign]
  );

  const updateOutreachDraftForDetailsRow = useCallback(
    (key: string, patch: Partial<OutreachDraftState>) => {
      setOutreachDrafts((current) => ({
        ...current,
        [key]: {
          ...current[key],
          ...patch
        } as OutreachDraftState
      }));
    },
    []
  );

  const saveOutreachDraftForDetailsRow = useCallback(
    async (key: string, patch?: Partial<Pick<OutreachDraftState, "subject" | "body">>) => {
      if (!detailsPanelRow || !selectedOutreachCampaign || !outreachDraftEndpoint) {
        return;
      }
      const draft = outreachDraftsRef.current[key] ? { ...outreachDraftsRef.current[key], ...patch } : undefined;
      if (!draft?.reminderId) {
        updateOutreachDraftForDetailsRow(key, { error: "Open this touch before saving the draft." });
        return;
      }
      if (
        !shouldSaveOutreachDraft({
          subject: draft.subject,
          body: draft.body,
          savedSubject: draft.savedSubject,
          savedBody: draft.savedBody
        })
      ) {
        updateOutreachDraftForDetailsRow(key, { dirty: false, saving: false, error: null, message: "Saved" });
        return;
      }
      const updateEndpoint = `${outreachDraftEndpoint.replace(/\/$/, "")}/update`;
      updateOutreachDraftForDetailsRow(key, { saving: true, error: null, message: null });
      try {
        const response = await fetch(updateEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default",
            reminderId: draft.reminderId,
            coldTargetId: detailsPanelRow.id,
            campaignId: selectedOutreachCampaign.id,
            subject: draft.subject,
            body: draft.body
          })
        });
        const payload = (await response.json()) as { error?: string; outreach?: { subject: string; body: string } };
        if (!response.ok) {
          throw new Error(payload.error ?? "Draft save failed.");
        }
        const savedSubject = payload.outreach?.subject ?? draft.subject;
        const savedBody = payload.outreach?.body ?? draft.body;
        setOutreachDrafts((current) => {
          const currentDraft = current[key];
          if (!currentDraft) {
            return current;
          }
          const responseMatchesCurrentText = currentDraft.subject === draft.subject && currentDraft.body === draft.body;
          return {
            ...current,
            [key]: {
              ...currentDraft,
              ...(responseMatchesCurrentText ? { subject: savedSubject, body: savedBody } : {}),
              savedSubject,
              savedBody,
              dirty: !responseMatchesCurrentText,
              saving: false,
              error: null,
              message: responseMatchesCurrentText ? "Saved" : null
            }
          };
        });
      } catch (reason) {
        updateOutreachDraftForDetailsRow(key, {
          saving: false,
          error: reason instanceof Error ? reason.message : "Draft save failed."
        });
      }
    },
    [detailsPanelRow, outreachDraftEndpoint, selectedOutreachCampaign, updateOutreachDraftForDetailsRow]
  );

  const clearOutreachDraftAutosave = useCallback((key: string) => {
    const timer = outreachDraftAutosaveTimersRef.current[key];
    if (timer) {
      clearTimeout(timer);
      delete outreachDraftAutosaveTimersRef.current[key];
    }
  }, []);

  const scheduleOutreachDraftAutosave = useCallback(
    (key: string, patch: Partial<Pick<OutreachDraftState, "subject" | "body">>) => {
      clearOutreachDraftAutosave(key);
      outreachDraftAutosaveTimersRef.current[key] = setTimeout(() => {
        delete outreachDraftAutosaveTimersRef.current[key];
        void saveOutreachDraftForDetailsRow(key, patch);
      }, 700);
    },
    [clearOutreachDraftAutosave, saveOutreachDraftForDetailsRow]
  );

  const editOutreachDraftForDetailsRow = useCallback(
    (key: string, patch: Partial<Pick<OutreachDraftState, "subject" | "body">>) => {
      updateOutreachDraftForDetailsRow(key, {
        ...patch,
        dirty: true,
        error: null,
        message: null
      });
      scheduleOutreachDraftAutosave(key, patch);
    },
    [scheduleOutreachDraftAutosave, updateOutreachDraftForDetailsRow]
  );

  const saveOutreachDraftImmediately = useCallback(
    (key: string, patch?: Partial<Pick<OutreachDraftState, "subject" | "body">>) => {
      clearOutreachDraftAutosave(key);
      void saveOutreachDraftForDetailsRow(key, patch);
    },
    [clearOutreachDraftAutosave, saveOutreachDraftForDetailsRow]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsCompactDetailsViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const startOutreachCampaignForDetailsRow = useCallback(async (planMode: "next" | "allDraft" = "next") => {
    if (!detailsPanelRow || !selectedOutreachCampaign || !outreachStartEndpoint || startingOutreachCampaign) {
      return;
    }
    setStartingOutreachCampaign(true);
    setOutreachCampaignError(null);
    try {
      const response = await fetch(outreachStartEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          coldTargetId: detailsPanelRow.id,
          campaignId: selectedOutreachCampaign.id,
          planMode
        })
      });
      const payload = (await response.json()) as {
        error?: string;
        rowPatch?: Record<string, string | null>;
        calendarItem?: CalendarCellItem;
        calendarItems?: CalendarCellItem[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Campaign start failed.");
      }
      applyOutreachResponseToRow(detailsPanelRow.id, payload);
    } catch (reason) {
      setOutreachCampaignError(reason instanceof Error ? reason.message : "Campaign start failed.");
    } finally {
      setStartingOutreachCampaign(false);
    }
  }, [applyOutreachResponseToRow, detailsPanelRow, outreachStartEndpoint, selectedOutreachCampaign, startingOutreachCampaign]);

  const advanceOutreachCampaignForDetailsRow = useCallback(
    async (action: "mark_sent" | "stop") => {
      if (!detailsPanelRow || !selectedOutreachCampaign || !outreachAdvanceEndpoint || advancingOutreachCampaign) {
        return;
      }
      setAdvancingOutreachCampaign(true);
      setOutreachCampaignError(null);
      try {
        const response = await fetch(outreachAdvanceEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "default",
            coldTargetId: detailsPanelRow.id,
            campaignId: selectedOutreachCampaign.id,
            action,
            ...(action === "stop" ? { outcome: selectedOutreachOutcome } : {})
          })
        });
        const payload = (await response.json()) as {
          error?: string;
          rowPatch?: Record<string, string | null>;
          calendarItems?: CalendarCellItem[];
          outreachProtocolItems?: OutreachProtocolItem[];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Campaign update failed.");
        }
        applyOutreachResponseToRow(detailsPanelRow.id, payload);
        void loadOutreachProtocol(detailsPanelRow.id);
      } catch (reason) {
        setOutreachCampaignError(reason instanceof Error ? reason.message : "Campaign update failed.");
      } finally {
        setAdvancingOutreachCampaign(false);
      }
    },
    [
      advancingOutreachCampaign,
      applyOutreachResponseToRow,
      detailsPanelRow,
      loadOutreachProtocol,
      outreachAdvanceEndpoint,
      selectedOutreachCampaign,
      selectedOutreachOutcome
    ]
  );

  const sendRowsToTelegram = useCallback(
    async (rowsToSend: CrmTableRow[]) => {
      if (!sendToTelegramEndpoint || rowsToSend.length === 0 || isSendingToTelegram) {
        return;
      }
      setIsSendingToTelegram(true);
      setCreateError(null);
      setTelegramSendNotice(null);
      try {
        const searchParams = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
        const chatIdValue = searchParams?.get("tgChatId") ?? searchParams?.get("chatId") ?? "";
        const chatId = Number(chatIdValue);
        const hasLinkedChat = chatIdValue.trim() !== "" && Number.isSafeInteger(chatId);
        if (!hasLinkedChat && typeof window !== "undefined" && window.matchMedia("(min-width: 769px)").matches) {
          const confirmed = window.confirm("No Telegram chat is linked. Send to configured Telegram chat(s)?");
          if (!confirmed) {
            return;
          }
        }
        const response = await fetch(sendToTelegramEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadIds: rowsToSend.map((row) => row.id),
            ...(hasLinkedChat ? { chatId } : {})
          })
        });
        const payload = (await response.json()) as { sent?: number; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Telegram send failed.");
        }
        setTelegramSendNotice(`Sent ${payload.sent ?? rowsToSend.length} to TG.`);
      } catch (reason) {
        setCreateError(reason instanceof Error ? reason.message : "Telegram send failed.");
      } finally {
        setIsSendingToTelegram(false);
      }
    },
    [isSendingToTelegram, sendToTelegramEndpoint]
  );

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
  const activeFieldGuideItems = isLeadTable ? leadFieldGuideItems : isColdTargetTable ? coldTargetFieldGuideItems : null;

  return (
    <section
      className="tableSurface"
      style={{ "--table-font-scale": tableFontScale } as CSSProperties}
    >
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
                {sendToTelegramEndpoint ? (
                  <button
                    type="button"
                    title="Send to TG"
                    aria-label="Send selected records to TG"
                    onClick={() => void sendRowsToTelegram(selectedRows)}
                    disabled={isSendingToTelegram}
                  >
                    <Send size={14} />
                    {isSendingToTelegram ? "Sending" : "Send to TG"}
                  </button>
                ) : null}
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
                    {!archiveEntity ? (
                      <button type="button" className="danger" onClick={() => setBulkActionDialog("delete")}>
                        <Trash2 size={13} />
                        Delete
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button type="button" onClick={() => setBulkActionDialog("merge")}>
                    <Merge size={15} />
                    Try to merge
                  </button>
                )}
                {archiveEntity ? (
                  <>
                    <button type="button" onClick={() => setBulkActionDialog("archive")}>
                      <Archive size={13} />
                      Archive
                    </button>
                    {archiveEntity === "lead" ? (
                      <button type="button" className="spicy" onClick={() => setBulkActionDialog("spicyArchive")}>
                        <Flame size={13} />
                        В утиль
                      </button>
                    ) : null}
                  </>
                ) : null}
                <button type="button" className="clearSelectionButton" aria-label="Clear row selection" onClick={() => setGridSelection(emptySelection())}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : null}
          {telegramSendNotice ? <div className="tableInlineNotice">{telegramSendNotice}</div> : null}
          <label className={`searchBox ${query.trim() ? "active" : ""}`}>
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>
          {isColdTargetTable ? (
            <label className={`countryFilter ${countryFilter ? "active" : ""}`}>
              <Globe2 size={15} aria-hidden="true" />
              <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} aria-label="Filter by country">
                <option value="">All countries</option>
                {countryOptions.includes("Germany") ? null : <option value="Germany">Germany</option>}
                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
          {configuredColumns.some((column) => column.valueKind === "handoff") ? (
            <div className="handoffBallControl">
              <button
                type="button"
                className="toolbarIconButton handoffBallButton"
                title="Choose handoff ball"
                aria-label="Choose handoff ball"
                aria-expanded={showHandoffMenu}
                onClick={() => setShowHandoffMenu((value) => !value)}
              >
                <span aria-hidden="true">{handoffBallIcons[normalizedHandoffBall(preferences.handoffBall)]}</span>
              </button>
              {showHandoffMenu ? (
                <div className="handoffBallPopover" role="dialog" aria-label="Choose handoff ball and sound">
                  <div className="handoffBallGrid" aria-label="Handoff ball">
                    {Object.entries(handoffBallLabels).map(([value, item]) => {
                      const isActive = normalizedHandoffBall(preferences.handoffBall) === value;
                      return (
                        <button
                          type="button"
                          className={`handoffBallOption${isActive ? " active" : ""}`}
                          key={value}
                          title={item.label}
                          aria-label={item.label}
                          aria-pressed={isActive}
                          onClick={() => {
                            setPreferences((current) => ({
                              ...current,
                              handoffBall: value as HandoffBallType
                            }));
                            setShowHandoffMenu(false);
                          }}
                        >
                          <span aria-hidden="true">{handoffBallIcons[value as HandoffBallType]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className={`handoffSoundToggle${preferences.handoffSoundEnabled === false ? "" : " active"}`}
                    aria-pressed={preferences.handoffSoundEnabled !== false}
                    onClick={() =>
                      setPreferences((current) => ({
                        ...current,
                        handoffSoundEnabled: current.handoffSoundEnabled === false
                      }))
                    }
                  >
                    {preferences.handoffSoundEnabled === false ? <VolumeX size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
                    <strong>{preferences.handoffSoundEnabled === false ? "Sound off" : "Sound on"}</strong>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
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
      {uploadProgress ? (
        <div className="tableNotice uploadProgressNotice" role="status" aria-live="polite">
          <div>
            <strong>
              Adding {uploadProgress.fileCount} {uploadProgress.fileCount === 1 ? "file" : "files"} to Downloads
            </strong>
            <span>{uploadProgress.percent}%</span>
          </div>
          <div className="uploadProgressTrack" aria-hidden="true">
            <span style={{ width: `${uploadProgress.percent}%` }} />
          </div>
        </div>
      ) : null}
      {uploadSuccess && !uploadTarget ? <div className="tableNotice success">{uploadSuccess}</div> : null}
      {uploadError && !uploadTarget ? <div className="tableNotice error">{uploadError}</div> : null}
      <div className="gridFrame" ref={gridFrameRef} onMouseLeave={() => {
        setRelatedTooltip(null);
        setDocumentTooltip(null);
        setCalendarTooltip(null);
        setHandoffTooltip(null);
        setWrappedTextTooltip(null);
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
              {calendarDayMonthLabel(item.startsAt)} {calendarTimeLabel(item.startsAt)} | {item.title}
            </span>
          ))}
        </div>
      ) : null}
        {handoffTooltip ? (
          <div
            className={`relatedTableTooltip handoffCellTooltip ${handoffTooltip.placement === "below" ? "relatedTableTooltipBelow" : ""}`}
            style={tableTooltipStyle(handoffTooltip.left, handoffTooltip.top)}
          >
            <strong>Insight available</strong>
            <span>Suggested next action will appear here.</span>
            <span>{handoffTooltip.rowName}</span>
          </div>
        ) : null}
        {wrappedTextTooltip ? (
          <div
            className={`relatedTableTooltip wrappedTextCellTooltip ${
              wrappedTextTooltip.placement === "below" ? "relatedTableTooltipBelow" : ""
            }`}
            style={tableTooltipStyle(wrappedTextTooltip.left, wrappedTextTooltip.top)}
          >
            <strong>{wrappedTextTooltip.title}</strong>
            <span>{wrappedTextTooltip.text}</span>
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
                    <small>{[client.phone, client.email].filter(Boolean).join(" | ") || client.company || "No contact details"}</small>
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
          customRenderers={[documentCellRenderer, calendarCellRenderer, handoffCellRenderer]}
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
          rowHeight={tableRowHeight}
          rowMarkerWidth={rowMarkerWidth}
          rowMarkers={{ kind: "both", checkboxStyle: "square", width: rowMarkerWidth }}
          theme={activeTableTheme}
          cellActivationBehavior="double-click"
          smoothScrollX
          smoothScrollY
        />
      </div>
      {archiveBlast ? (
        <div className="archiveBlast" key={archiveBlast.key} aria-live="polite">
          <div className="archiveBlastAsh" aria-hidden="true" />
          <div className="archiveBlastStamp">
            <Flame size={20} />
            <strong>В утиль</strong>
            <span>{archiveBlast.count === 1 ? "Lead closed" : `${archiveBlast.count} leads closed`}</span>
          </div>
        </div>
      ) : null}
      {activeFieldGuideItems ? (
        <details className="leadFieldGuide">
          <summary>
            <span>Field guide</span>
            <strong>
              What is manual, automatic, linked, and technical in the {isLeadTable ? "Leads" : "Cold Targets"} table
            </strong>
          </summary>
          <div
            className="leadFieldGuideGrid"
            role="table"
            aria-label={`${isLeadTable ? "Leads" : "Cold Targets"} field guide`}
          >
            <div className="leadFieldGuideHeader" role="row">
              <span role="columnheader">Field</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Meaning</span>
            </div>
            {activeFieldGuideItems.map((item) => (
              <div className="leadFieldGuideRow" role="row" key={item.field}>
                <strong role="cell">{item.field}</strong>
                <span role="cell">{item.source}</span>
                <p role="cell">{item.meaning}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
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
          const visibleDocuments = documents.slice(0, 2);
          const extraDocuments = documents.slice(2);
          const mobileLeadWorkFields = [
            { label: "Interest", value: textCellValue(row.values.interest) },
            { label: "Urgency", value: textCellValue(row.values.urgency) },
            { label: "Todo", value: textCellValue(row.values.todo) }
          ].filter((field) => Boolean(field.value));
          const mobileSecondaryFields = [
            {
              label: "Status",
              value: rowIsArchived(row) && rowArchiveMood(row) === "spicy" ? "В утиле" : textCellValue(row.values.status)
            }
          ].filter((field) => Boolean(field.value));
          if (isLeadTable) {
            return (
              <article
                className={`mobileTableRow mobileLeadCard${row.id === flashRowId ? " focused" : ""}${rowIsArchived(row) ? ` archived ${rowArchiveMood(row)}` : ""}`}
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetailsPanel(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDetailsPanel(row);
                  }
                }}
                ref={(element) => {
                  if (element) {
                    mobileRowRefs.current.set(row.id, element);
                  } else {
                    mobileRowRefs.current.delete(row.id);
                  }
                }}
              >
                {sendToTelegramEndpoint ? (
                  <button
                    type="button"
                    className="mobileLeadSendTelegramButton"
                    aria-label={`Send ${publicRowCode ?? row.id} to TG`}
                    title="Send to TG"
                    onClick={(event) => {
                      event.stopPropagation();
                      void sendRowsToTelegram([row]);
                    }}
                    disabled={isSendingToTelegram}
                  >
                    <Send size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="mobileLeadCardHeader"
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyLeadCode(publicRowCode ?? row.id);
                  }}
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

                {mobileLeadWorkFields.length > 0 ? (
                  <section className="mobileLeadCardSection">
                    <span>Lead work</span>
                    <div className="mobileLeadWorkFields">
                      {mobileLeadWorkFields.map((field) => (
                        <span key={field.label}>
                          <i>{field.label}</i>
                          <strong>{field.value}</strong>
                        </span>
                      ))}
                    </div>
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

                <section className="mobileLeadDownloads" onClick={(event) => event.stopPropagation()}>
                  <div className="mobileLeadDownloadsHeader">
                    <span>
                      Downloads: {documents.length} {documents.length === 1 ? "item" : "items"}
                    </span>
                    {documentUploadEndpoint ? (
                      <div className="downloadsHeaderActions">
                        {renderDownloadsUploadInlineStatus(row.id)}
                        <button
                          type="button"
                          className="downloadsUploadButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDocumentUploadForRow(row.id);
                          }}
                          title="Upload documents to this lead"
                        >
                          <Plus size={13} aria-hidden="true" />
                          <span>Add files</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {visibleDocuments.length > 0 ? (
                    <div className="leadDocumentCardList">
                      {visibleDocuments.map((document, documentIndex) => {
                        const extension = commercialOfferDocument(document) ? "KP" : documentExtensionLabel(document.fileName, document.mimeType);
                        const createdAt = formatDocumentHistoryTimestamp(document.createdAt);
                        const displayLabel = documentListDisplayLabel(documents, documentIndex);
                        const summaryText = documentCardSummary(document);
                        return (
                          <button
                            type="button"
                            className="leadDocumentCard mobileLeadDocumentCard"
                            key={document.id}
                            title={`${document.fileName}${summaryText ? `\n${summaryText}` : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreviewDocument(document);
                            }}
                          >
                            <span
                              className="leadDocumentCardBadge"
                              style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                            >
                              {extension.slice(0, 3)}
                            </span>
                            <span className="leadDocumentCardMain">
                              <strong>{displayLabel}</strong>
                              <em>{createdAt ?? "Date unknown"}</em>
                            </span>
                            <span className="leadDocumentCardSummary">{summaryText}</span>
                          </button>
                        );
                      })}
                      {extraDocuments.length > 0 ? (
                        <details className="mobileLeadExtraDownloads">
                          <summary>
                            Show all {documents.length} documents
                            <i aria-hidden="true" />
                          </summary>
                          <div className="leadDocumentCardList">
                            {extraDocuments.map((document, extraIndex) => {
                              const documentIndex = extraIndex + 2;
                              const extension = commercialOfferDocument(document) ? "KP" : documentExtensionLabel(document.fileName, document.mimeType);
                              const createdAt = formatDocumentHistoryTimestamp(document.createdAt);
                              const displayLabel = documentListDisplayLabel(documents, documentIndex);
                              const summaryText = documentCardSummary(document);
                              return (
                                <button
                                  type="button"
                                  className="leadDocumentCard mobileLeadDocumentCard"
                                  key={document.id}
                                  title={`${document.fileName}${summaryText ? `\n${summaryText}` : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPreviewDocument(document);
                                  }}
                                >
                                  <span
                                    className="leadDocumentCardBadge"
                                    style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                                  >
                                    {extension.slice(0, 3)}
                                  </span>
                                  <span className="leadDocumentCardMain">
                                    <strong>{displayLabel}</strong>
                                    <em>{createdAt ?? "Date unknown"}</em>
                                  </span>
                                  <span className="leadDocumentCardSummary">{summaryText}</span>
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mobileLeadMuted">No documents yet.</p>
                  )}
                </section>

                {hasSummary ? (
                  <section className="mobileLeadCardSection">
                    <span>Summary{summary.updatedAt ? ` | ${readableDateTimeLabel(summary.updatedAt)}` : ""}</span>
                    {summary.long ? (
                      <details className="mobileLeadFullSummary" onClick={(event) => event.stopPropagation()}>
                        <summary>
                          <p className="mobileLeadCardSummaryText">{summary.short}</p>
                        </summary>
                        <p>{summary.long}</p>
                        {leadSummariesEndpoint ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openLeadSummaryHistory(row);
                            }}
                          >
                            History
                          </button>
                        ) : null}
                      </details>
                    ) : (
                      <p className="mobileLeadCardSummaryText">{summary.short}</p>
                    )}
                  </section>
                ) : null}

                {mobileSecondaryFields.length > 0 ? (
                  <section className="mobileLeadSecondaryFields" aria-label="Secondary lead fields">
                    {mobileSecondaryFields.map((field) => (
                      <span key={field.label}>
                        <i>{field.label}</i>
                        <strong>{field.value}</strong>
                      </span>
                    ))}
                  </section>
                ) : null}
              </article>
            );
          }
          return (
            <article
              className={`mobileTableRow${row.id === flashRowId ? " focused" : ""}${rowIsArchived(row) ? ` archived ${rowArchiveMood(row)}` : ""}`}
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
                          {documents.map((document, documentIndex) => {
                            const extension = documentExtensionLabel(document.fileName, document.mimeType);
                            const createdAt = formatDocumentHistoryTimestamp(document.createdAt);
                            const displayLabel = documentListDisplayLabel(documents, documentIndex);
                            return (
                              <button
                                type="button"
                                className="leadDocumentCard detailsDocumentCard"
                                key={document.id}
                                title={[
                                  document.fileName,
                                  createdAt ? `Added ${createdAt}` : "Added date unknown",
                                  document.shortSummary || "No summary yet"
                                ].join("\n")}
                                onClick={() => setPreviewDocument(document)}
                              >
                                <span
                                  className="leadDocumentCardBadge"
                                  style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                                >
                                  {extension.slice(0, 3)}
                                </span>
                                <span className="leadDocumentCardMain">
                                  <strong>{displayLabel}</strong>
                                </span>
                                <span className="detailsDocumentCardText">
                                  <small>{createdAt ?? "Date unknown"}</small>
                                  <span className="detailsDocumentCardSummary">{document.shortSummary || "No summary yet"}</span>
                                </span>
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
                  <span>Summary{summary.updatedAt ? ` | ${mobileDisplayValue(summary.updatedAt)}` : ""}</span>
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
          <section className="detailsDrawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>{detailsModalEyebrow}</span>
                <h2>{detailsModalTitle}</h2>
                <p>{detailsModalSubtitle}</p>
              </div>
              <button type="button" onClick={() => setDetailsPanel(null)} aria-label="Close lead details">
                <X size={18} />
              </button>
            </header>

            {isLeadTable ? (
              <section className="leadProgressHud" aria-label="Lead progress">
                <div className="leadProgressHeader">
                  <span>Katya progress</span>
                </div>
                <div className="leadProgressScroller">
                  <div className="leadProgressTrack" role="list" aria-label="Katya progress stages">
                    {leadProgressStages.map((stage, stageIndex) => {
                      const state = deriveLeadProgressState(stageIndex, detailsLeadSelectedStage);
                      const isCurrent = state === "current";
                      const isLocked = isLeadProgressStageLocked(stageIndex, detailsLeadSelectedStage);
                      const isSavingRow = detailsPanelRow ? leadProgressSavingRowId === detailsPanelRow.id : false;
                      const isFeedbackStage = activeLeadProgressFeedback?.stageIndex === stageIndex;
                      const isDraftRow = Boolean(detailsPanelRow?.id.startsWith("draft-"));
                      const isDisabled = !detailsPanelRow || !updateRecordEndpoint || isSavingRow || isLocked || isDraftRow;
                      const stateLabel =
                        state === "current"
                          ? "current stage"
                          : state === "completed"
                            ? "completed stage"
                            : state === "available"
                              ? "available stage"
                              : "locked stage";
                      return (
                        <div className="leadProgressTrackItem" role="listitem" key={stage.id}>
                          <button
                            type="button"
                            className={`leadProgressStep state-${state}${isFeedbackStage ? " feedback" : ""}${
                              isFeedbackStage && activeLeadProgressFeedback?.kind === "complete" ? " completion" : ""
                            }`}
                            aria-pressed={isCurrent}
                            aria-current={isCurrent ? "step" : undefined}
                            aria-label={`Stage ${stageIndex + 1} of ${leadProgressStages.length}: ${stage.label}, ${stateLabel}`}
                            disabled={isDisabled}
                            style={{ "--achievement-color": stage.color } as CSSProperties}
                            title={stage.description}
                            onClick={() => {
                              if (!detailsPanelRow || isLocked || stageIndex === detailsLeadSelectedStage) {
                                return;
                              }
                              void persistLeadProgressStage(detailsPanelRow, stageIndex);
                            }}
                          >
                            <span className="leadProgressIcon" aria-hidden="true">
                              <img src={stage.image} alt="" draggable={false} />
                            </span>
                            <span className="leadProgressLabel">{stage.label}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            <div
              className={`detailsDrawerBody${hasDetailsSideSections ? "" : " single"}${isLeadTable ? " lead" : ""}${isColdTargetTable ? " coldTarget" : ""}`}
            >
              <details className="detailsDrawerFieldsPanel" open={!isCompactDetailsViewport}>
                <summary>
                  <span>{isLeadTable ? "Lead fields" : isColdTargetTable ? "Call target fields" : "Record fields"}</span>
                  <strong>{isCompactDetailsViewport ? "Tap to edit" : "Fields"}</strong>
                </summary>
                <div className="detailsDrawerFields">
                {isLeadTable ? (
                  <section className="detailsClientSection">
                    <span className="detailsFieldLabel">Client</span>
                    <div className="detailsClientPicker">
                      <input
                        readOnly
                        aria-label="Selected client"
                        value={clientPickerLabel(
                          clientOptions.find((client) => client.id === detailsPanel.selectedClientId) ?? null,
                          detailsPanel.values["client.name"]
                        )}
                        onClick={() =>
                          setDetailsPanel((current) => (current ? { ...current, clientPickerOpen: true } : current))
                        }
                      />
                      <button
                        type="button"
                        aria-label="Choose client"
                        onClick={() =>
                          setDetailsPanel((current) =>
                            current ? { ...current, clientPickerOpen: !current.clientPickerOpen } : current
                          )
                        }
                      >
                        <Search size={14} />
                      </button>
                      {detailsPanel.clientPickerOpen ? (
                        <div className="detailsClientOptions">
                          {clientOptions.length > 0 ? (
                            clientOptions.slice(0, 8).map((client) => (
                              <button type="button" key={client.id} onClick={() => selectClientInDetails(client)}>
                                {visibleClientReference(client) ? <span>{visibleClientReference(client)}</span> : null}
                                <strong>{client.name ?? "Unnamed client"}</strong>
                                <small>{[client.phone, client.email].filter(Boolean).join(" | ") || client.company || "No contact details"}</small>
                              </button>
                            ))
                          ) : (
                            <p>No clients found.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}
                {isLeadTable ? (
                  <section className="detailsCommercialFields" aria-label="Commercial fields">
                    <div className="detailsCommercialGrid">
                      <label>
                        <span className="detailsFieldLabel">Deal net</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={detailsPanel.values.expectedFeeNet ?? ""}
                          onChange={(event) => setDetailsValue("expectedFeeNet", event.target.value)}
                        />
                      </label>
                      <label>
                        <span className="detailsFieldLabel">Oleg %</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={detailsPanel.values.olegPercent ?? ""}
                          onChange={(event) => setDetailsValue("olegPercent", event.target.value)}
                        />
                      </label>
                      <label className="detailsCommercialToggle">
                        <input
                          type="checkbox"
                          aria-label="Oleg commission enabled"
                          checked={detailsPanel.values.olegCommissionEnabled === "true" || detailsPanel.values.olegCommissionEnabled === "yes"}
                          onChange={(event) => setDetailsValue("olegCommissionEnabled", event.target.checked ? "true" : "false")}
                        />
                        <span>Oleg commission</span>
                      </label>
                    </div>
                  </section>
                ) : null}
                {detailsPrimaryColumns.map((column) => {
                  const canEdit = detailsEditableColumns.some((editableColumn) => editableColumn.id === column.id);
                  const displayValue =
                    column.valueKind === "area"
                      ? formatAreaValue(detailsPanelRow.values[column.id])
                      : mobileDisplayValue(detailsPanelRow.values[column.id]);
                  const guide = guideForColumn(column, isColdTargetTable);
                  if (!canEdit) {
                    return (
                      <div className="detailsDrawerField readonly" key={column.id}>
                        <span className="detailsFieldLabel">
                          {column.title}
                          {guide ? <i title={`${guide.source}: ${guide.meaning}`}>?</i> : null}
                        </span>
                        <strong>{displayValue}</strong>
                      </div>
                    );
                  }
                  if (column.valueKind === "handoff") {
                    const side = normalizedHandoffSide(detailsPanel.values[column.id] ?? detailsPanelRow.values[column.id]);
                    const ball = handoffBallIcons[normalizedHandoffBall(preferences.handoffBall)];
                    const animation = handoffAnimations[detailsPanel.rowId] ?? null;
                    const from = animation?.from ?? side;
                    const to = animation?.to ?? side;
                    const progress = animation?.progress ?? null;
                    const startX = from === "client" ? 100 : 0;
                    const endX = to === "client" ? 100 : 0;
                    const eased = progress === null ? 1 : 1 - Math.pow(1 - progress, 3);
                    const ballX = progress === null ? (side === "client" ? 100 : 0) : startX + (endX - startX) * eased;
                    const ballY = progress === null ? 0 : -Math.sin(Math.PI * progress) * 18;
                    const displaySide = progress === null ? side : to;
                    return (
                      <div className="detailsDrawerField detailsHandoffField" key={column.id}>
                        <span className="detailsFieldLabel">
                          {column.title}
                          {guide ? <i title={`${guide.source}: ${guide.meaning}`}>?</i> : null}
                        </span>
                        <button
                          type="button"
                          className={`detailsHandoffControl ${displaySide}${progress === null ? "" : " animating"}`}
                          style={
                            {
                              "--details-ball-x": `${ballX}%`,
                              "--details-ball-y": `${ballY}px`
                            } as CSSProperties
                          }
                          onClick={toggleDetailsHandoffBall}
                          aria-label={`Ball is on ${side === "us" ? "our" : "client"} side`}
                        >
                          <span className="detailsHandoffSide">us</span>
                          <span className="detailsHandoffTrack" aria-hidden="true">
                            <b>{ball}</b>
                          </span>
                          <span className="detailsHandoffSide">client</span>
                        </button>
                      </div>
                    );
                  }
                  return (
                    <label className={isMobileMultilineColumn(column.id) ? "wide" : ""} key={column.id}>
                      <span className="detailsFieldLabel">
                        {column.title}
                        {guide ? <i title={`${guide.source}: ${guide.meaning}`}>?</i> : null}
                      </span>
                      {column.id === "firstTouchChannel" ? (
                        <select
                          value={detailsPanel.values[column.id] ?? ""}
                          onChange={(event) => setDetailsValue(column.id, event.target.value)}
                        >
                          {firstTouchChannelOptions.map((option) => (
                            <option key={option.value || "auto"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : isMobileMultilineColumn(column.id) ? (
                        <textarea
                          rows={detailsTextareaRows(column.id, detailsPanel.values[column.id] ?? detailsPanelRow.values[column.id])}
                          title={detailsPanel.values[column.id] ?? ""}
                          value={detailsPanel.values[column.id] ?? ""}
                          onChange={(event) => setDetailsValue(column.id, event.target.value)}
                        />
                      ) : (
                        <input
                          value={detailsPanel.values[column.id] ?? ""}
                          onChange={(event) => setDetailsValue(column.id, event.target.value)}
                        />
                      )}
                    </label>
                  );
                })}
                {detailsSecondaryColumns.length > 0 ? (
                  <section className="detailsSecondaryFields" aria-label="Secondary lead fields">
                    <header>
                      <span>Secondary status fields</span>
                      <small>Readonly for now</small>
                    </header>
                    <div>
                      {detailsSecondaryColumns.map((column) => {
                        const displayValue =
                          column.valueKind === "area"
                            ? formatAreaValue(detailsPanelRow.values[column.id])
                            : mobileDisplayValue(detailsPanelRow.values[column.id]);
                        const guide = guideForColumn(column, isColdTargetTable);
                        return (
                          <div className="detailsSecondaryField" key={column.id}>
                            <span className="detailsFieldLabel">
                              {column.title}
                              {guide ? <i title={`${guide.source}: ${guide.meaning}`}>?</i> : null}
                            </span>
                            <strong>{displayValue || "n/a"}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                </div>
              </details>

              {hasDetailsSideSections ? (
                <div className="detailsDrawerSections">
                  {isLeadTable ? (
                    <details className="detailsDrawerSection offer">
                      <summary className="detailsDrawerSectionHeader">
                        <span className="detailsDrawerToggle" aria-hidden="true" />
                        <div>
                          <span>
                            Commercial offer
                            <strong>
                            {detailsOfferFieldInputs.length > 0
                              ? `${detailsOfferFieldInputs.length} field${detailsOfferFieldInputs.length === 1 ? "" : "s"}`
                              : "Ready"}
                            </strong>
                          </span>
                          <small className="detailsOfferSummaryPreview">
                            {detailsOfferFieldInputs.length > 0
                              ? detailsOfferFieldInputs.map((field) => field.label).join(", ")
                              : detailsOfferPreview.status === "missing"
                                ? detailsOfferPreview.reason
                                : `${detailsOfferPreview.status === "manual" ? "Manual" : "Auto"} price: ${formatOfferCurrency(detailsOfferPreview.totalGross)}`}
                          </small>
                        </div>
                        <div className="detailsOfferActions">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void copyOfferMissingFields(detailsPanelRow);
                            }}
                            title="Copy the fields still needed for the commercial offer."
                          >
                            {copiedOfferFieldsRowId === detailsPanelRow.id ? "Copied" : "Copy missing fields"}
                          </button>
                          {offerGenerateEndpoint ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void generateOfferForDetailsRow();
                              }}
                              disabled={isGeneratingOffer}
                              title="Save current offer fields, generate a new KP draft, and add it to Downloads."
                            >
                              {isGeneratingOffer ? "Generating..." : "Download KP"}
                            </button>
                          ) : null}
                        </div>
                      </summary>
                      <div className="detailsOfferMissingEditor">
                        <section className="detailsOfferInputs">
                          <span>Input fields</span>
                          {detailsOfferFormInputs.map((field) => (
                            <label key={field.columnId}>
                              <span>{offerFormFieldLabel(field)}</span>
                              {field.key === "project_type" ? (
                                <select
                                  value={detailsPanel.values[field.columnId] ?? ""}
                                  onChange={(event) => setDetailsValue(field.columnId, event.target.value)}
                                >
                                  <option value="">Choose project type</option>
                                  {offerProjectTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={detailsPanel.values[field.columnId] ?? ""}
                                  placeholder={field.placeholder}
                                  onChange={(event) => setDetailsValue(field.columnId, event.target.value)}
                                  onBlur={
                                    field.columnId === "area"
                                      ? (event) => setDetailsValue(field.columnId, formatOfferAreaInputValue(event.target.value))
                                      : undefined
                                  }
                                />
                              )}
                              {field.key === "project_type" ? (
                                <small>{offerProjectTypePricingHint(detailsPanel.values[field.columnId])}</small>
                              ) : field.hint ? (
                                <small>{field.hint}</small>
                              ) : null}
                            </label>
                          ))}
                        </section>
                        <section className="detailsOfferCalculatedPanel">
                          <span>Calculated</span>
                          <div className="detailsOfferCalculatedCard">
                            <dl className="detailsOfferCalculatedList">
                              <div>
                                <dt>Mode</dt>
                                <dd>
                                  {detailsOfferPreview.status === "missing"
                                    ? "Not ready"
                                    : detailsOfferPreview.status === "manual"
                                      ? "Manual"
                                      : "Auto"}
                                </dd>
                              </div>
                              <div>
                                <dt>Basis</dt>
                                <dd>{detailsOfferPreview.reason}</dd>
                              </div>
                              <div>
                                <dt>Wohnfläche / m²</dt>
                                <dd>{formatOfferNumber(detailsOfferPreview.wohnflaeche, " m\u00B2")}</dd>
                              </div>
                              <div>
                                <dt>LP 1-3 net</dt>
                                <dd>{formatOfferCurrency(detailsOfferPreview.lp1_3Net)}</dd>
                              </div>
                              <div>
                                <dt>LP 4 net</dt>
                                <dd>{formatOfferCurrency(detailsOfferPreview.lp4Net)}</dd>
                              </div>
                              <div>
                                <dt>Total net</dt>
                                <dd>{formatOfferCurrency(detailsOfferPreview.totalNet)}</dd>
                              </div>
                              <div>
                                <dt>VAT 19%</dt>
                                <dd>{formatOfferCurrency(detailsOfferPreview.mwst)}</dd>
                              </div>
                            </dl>
                            <div className="detailsOfferTotalGross">
                              <span>Total gross</span>
                              <strong>{formatOfferCurrency(detailsOfferPreview.totalGross)}</strong>
                            </div>
                            <div className="detailsOfferPaymentPlan">
                              <span>Payment plan</span>
                              <div>
                                <strong>30%</strong>
                                <em>{formatOfferCurrency(detailsOfferPreview.ms1Net)}</em>
                              </div>
                              <div>
                                <strong>40%</strong>
                                <em>{formatOfferCurrency(detailsOfferPreview.ms2Net)}</em>
                              </div>
                              <div>
                                <strong>30%</strong>
                                <em>{formatOfferCurrency(detailsOfferPreview.ms3Net)}</em>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    </details>
                  ) : null}

                  {isColdTargetTable ? (
                    <section className="detailsDrawerSection outreach">
                      <div className="detailsDrawerSectionHeader detailsOutreachHeader">
                        <div className="detailsOutreachHeaderTitle">
                          <span>Outreach</span>
                          <strong>{mobileDisplayValue(detailsPanelRow.values.campaignStatus) || "Not started"}</strong>
                        </div>
                      </div>
                      <section className="detailsOutreachProtocol" aria-label="Outreach protocol">
                        <div className="detailsOutreachProtocolHeader">
                          <span>Protocol</span>
                          <small>{outreachProtocol.length} entries</small>
                        </div>
                        {outreachProtocolError ? <p className="detailsDrawerError">{outreachProtocolError}</p> : null}
                        {!outreachProtocolError && outreachProtocol.length === 0 ? (
                          <p className="detailsOutreachProtocolEmpty">No sent touches yet</p>
                        ) : null}
                        {outreachProtocol.length > 0 ? (
                          <div className="detailsOutreachProtocolList">
                            {outreachProtocol.map((entry, index) => {
                              const date = formatOutreachProtocolDate(entry.occurredAt);
                              const tooltip = `${entry.authorName}${entry.authorEmail ? ` · ${entry.authorEmail}` : ""} · ${date}`;
                              return (
                                <div
                                  className={`detailsOutreachProtocolRow ${index === 0 ? "current" : "completed"}`}
                                  key={entry.id}
                                >
                                  <div className="detailsOutreachProtocolMeta">
                                    <span className="detailsOutreachProtocolChannel">{formatOutreachProtocolChannel(entry.channel)}</span>
                                    <span className="detailsOutreachProtocolAuthor" title={tooltip} aria-label={tooltip}>
                                      <strong>{entry.authorCode}</strong>
                                      <span>{entry.authorName}</span>
                                    </span>
                                  </div>
                                  <time className="detailsOutreachProtocolDate">{date}</time>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </section>
                      {outreachCampaigns.length > 0 ? (
                        <div className="detailsOutreachPanel">
                          <label className="detailsOutreachCampaignField">
                            <span>Campaign</span>
                            <select
                              title={selectedOutreachCampaign?.name ?? "Campaign"}
                              value={selectedOutreachCampaign?.id ?? ""}
                              onChange={(event) => setSelectedOutreachCampaignId(event.target.value)}
                            >
                              {outreachCampaigns.map((campaign) => (
                                <option key={campaign.id} value={campaign.id}>
                                  {campaign.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedOutreachCampaign ? (
                            <>
                              <p className="detailsOutreachSummary" title={selectedOutreachCampaign.summary}>
                                {selectedOutreachCampaign.summary}
                              </p>
                              {detailsPanelRow.values.campaignName ? (
                                <div
                                  className="detailsOutreachCurrent"
                                  title={[
                                    detailsOutreachProgressLabel,
                                    detailsCurrentOutreachTouch?.title,
                                    detailsPanelRow.values.nextAction
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                >
                                  <span>Current touch</span>
                                  <strong>
                                    <b>{detailsOutreachProgressLabel}</b>
                                    {detailsCurrentOutreachTouch
                                      ? ` · ${outreachChannelLabel(detailsCurrentOutreachTouch.channel)} · ${detailsCurrentOutreachTouch.title} · D+${detailsCurrentOutreachTouch.dayOffset}`
                                      : ""}
                                  </strong>
                                </div>
                              ) : null}
                              <div className="detailsOutreachTouches">
                                {orderedOutreachTouchpoints.map((touch) => {
                                  const key = outreachDraftKey(detailsPanelRow.id, selectedOutreachCampaign.id, touch.id);
                                  const draft = outreachDrafts[key];
                                  const isPreviewDraft = styledOutreachDrafts[key] ?? false;
                                  const isCurrentTouch = detailsOutreachProgress?.current === touch.touchNumber;
                                  const isPastTouch = Boolean(detailsOutreachProgress && touch.touchNumber < detailsOutreachProgress.current);
                                  const autosaveStatus = draft
                                    ? autosaveLabelForDraft({
                                        saving: draft.saving,
                                        dirty: draft.dirty,
                                        error: draft.error,
                                        message: draft.message
                                      })
                                    : null;
                                  return (
                                    <details
                                      className={`detailsOutreachTouch${isCurrentTouch ? " current" : ""}${isPastTouch ? " past" : ""}`}
                                      open={Boolean(draft && !draft.loading)}
                                      key={touch.id}
                                      onToggle={(event) => {
                                        if (event.currentTarget.open) {
                                          void loadOutreachDraftForDetailsRow(touch);
                                        }
                                      }}
                                    >
                                      <summary>
                                        <span className="detailsOutreachTouchTitle">
                                          <span>D+{touch.dayOffset}</span>
                                          <strong>{touch.title}</strong>
                                        </span>
                                        <small>{isCurrentTouch ? "current" : touch.channel}</small>
                                      </summary>
                                      <div className="detailsOutreachDraft">
                                        <div className="detailsOutreachDraftHeader">
                                          <p>{touch.action}</p>
                                          <button
                                            type="button"
                                            aria-pressed={isPreviewDraft}
                                            onClick={() =>
                                              setStyledOutreachDrafts((current) => ({
                                                ...current,
                                                [key]: !isPreviewDraft
                                              }))
                                            }
                                          >
                                            {isPreviewDraft ? "Edit" : "Preview"}
                                          </button>
                                        </div>
                                        {!draft || draft.loading ? <p className="detailsOutreachDraftStatus">Preparing draft...</p> : null}
                                        {draft?.error ? <p className="detailsDrawerError">{draft.error}</p> : null}
                                        {draft && !draft.loading && draft.reminderId ? (
                                          <>
                                            <label>
                                              <span>Subject</span>
                                              <input
                                                value={draft.subject}
                                                placeholder="No subject prepared"
                                                onBlur={(event) =>
                                                  saveOutreachDraftImmediately(key, { subject: event.currentTarget.value })
                                                }
                                                onChange={(event) =>
                                                  editOutreachDraftForDetailsRow(key, { subject: event.target.value })
                                                }
                                              />
                                            </label>
                                            <label>
                                              <span>Email</span>
                                              {isPreviewDraft ? (
                                                <div className="detailsOutreachEmailPreview" aria-label="Email body preview">
                                                  {emailBodyParagraphs(draft.body).map((paragraph, paragraphIndex, paragraphs) => (
                                                    <p
                                                      className={
                                                        paragraphIndex === 0
                                                          ? "lead"
                                                          : paragraphIndex === paragraphs.length - 1
                                                            ? "closing"
                                                            : undefined
                                                      }
                                                      key={`${key}-${paragraphIndex}`}
                                                    >
                                                      {paragraph}
                                                    </p>
                                                  ))}
                                                </div>
                                              ) : (
                                                <textarea
                                                  rows={12}
                                                  value={draft.body}
                                                  placeholder="No draft prepared"
                                                  onBlur={(event) =>
                                                    saveOutreachDraftImmediately(key, { body: event.currentTarget.value })
                                                  }
                                                  onChange={(event) =>
                                                    editOutreachDraftForDetailsRow(key, { body: event.target.value })
                                                  }
                                                />
                                              )}
                                            </label>
                                            <div className="detailsOutreachDraftActions">
                                              {autosaveStatus ? (
                                                <span
                                                  className={`detailsOutreachAutosave detailsOutreachAutosave-${autosaveStatus.tone}`}
                                                >
                                                  {autosaveStatus.label}
                                                </span>
                                              ) : null}
                                              <button
                                                type="button"
                                                onClick={() => saveOutreachDraftImmediately(key)}
                                                disabled={draft.saving}
                                              >
                                                {draft.saving ? "Saving" : "Save draft"}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => void loadOutreachDraftForDetailsRow(touch, { force: true })}
                                              >
                                                Recreate
                                              </button>
                                              <button
                                                type="button"
                                                disabled={draft.channel !== "email" || !draft.email}
                                                onClick={() => {
                                                  if (draft.email) {
                                                    window.open(
                                                      gmailComposeUrl(
                                                        draft.email,
                                                        draft.subject,
                                                        draft.body
                                                      ),
                                                      "_blank",
                                                      "noopener,noreferrer"
                                                    );
                                                  }
                                                }}
                                              >
                                                {draft.channel === "email" && draft.email ? "Send email" : "No email address"}
                                              </button>
                                            </div>
                                            {draft.message ? <span className="detailsOutreachDraftStatus">{draft.message}</span> : null}
                                          </>
                                        ) : null}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                              {outreachCampaignError ? <p className="detailsDrawerError">{outreachCampaignError}</p> : null}
                              {detailsPanelRow.values.campaignName ? (
                                <>
                                  <div className="detailsOutreachWorkflow">
                                    <div>
                                      <span>Current step action</span>
                                      <strong>{detailsOutreachProgressLabel}</strong>
                                    </div>
                                    <button
                                      type="button"
                                      className="primary"
                                      onClick={() => void advanceOutreachCampaignForDetailsRow("mark_sent")}
                                      disabled={advancingOutreachCampaign || !outreachAdvanceEndpoint}
                                    >
                                      {advancingOutreachCampaign ? "Updating" : detailsMarkSentLabel}
                                    </button>
                                  </div>
                                  <div className="detailsOutreachOutcome">
                                    <label>
                                      <span>Close campaign outcome</span>
                                      <select
                                        value={selectedOutreachOutcome}
                                        onChange={(event) => setSelectedOutreachOutcome(event.target.value)}
                                      >
                                        {outreachOutcomeOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => void advanceOutreachCampaignForDetailsRow("stop")}
                                      disabled={advancingOutreachCampaign || !outreachAdvanceEndpoint}
                                    >
                                      Stop Campaign
                                    </button>
                                    <small>Saves the selected outcome and stops the cadence.</small>
                                  </div>
                                </>
                              ) : null}
                              <div className="detailsOutreachActions">
                                <button
                                  type="button"
                                  className={detailsPanelRow.values.campaignName ? undefined : "primary"}
                                  onClick={() => void startOutreachCampaignForDetailsRow("next")}
                                  disabled={startingOutreachCampaign || !outreachStartEndpoint}
                                >
                                  {startingOutreachCampaign
                                    ? "Starting"
                                    : detailsPanelRow.values.campaignName
                                      ? "Restart campaign"
                                      : "Start campaign"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void startOutreachCampaignForDetailsRow("allDraft")}
                                  disabled={startingOutreachCampaign || !outreachStartEndpoint}
                                >
                                  Draft all touches
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <p className="detailsDrawerEmpty compact">No outreach campaigns configured.</p>
                      )}
                    </section>
                  ) : null}

                  {hasDetailsDocumentsSection ? (
                    <section className="detailsDrawerDetails detailsDownloadsSection">
                      <div className="detailsDownloadsHeader">
                        <span>
                          Downloads: {detailsPanelDocuments.length} {detailsPanelDocuments.length === 1 ? "item" : "items"}
                        </span>
                        {detailsPanelRow && documentUploadEndpoint ? (
                          <div className="downloadsHeaderActions">
                            {renderDownloadsUploadInlineStatus(detailsPanelRow.id)}
                            <button
                              type="button"
                              className="downloadsUploadButton"
                              onClick={() => openDocumentUploadForRow(detailsPanelRow.id)}
                              title="Upload documents to this lead"
                            >
                              <Plus size={13} aria-hidden="true" />
                              <span>Add files</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {detailsPanelVisibleDocuments.length > 0 ? (
                        <div className="leadDocumentCardList">
                          {detailsPanelVisibleDocuments.map((document, documentIndex) => {
                            const extension = documentExtensionLabel(document.fileName, document.mimeType);
                            const createdAt = formatDocumentHistoryTimestamp(document.createdAt);
                            const displayLabel = documentListDisplayLabel(detailsPanelDocuments, documentIndex);
                            return (
                              <button
                                type="button"
                                className="leadDocumentCard detailsDocumentCard"
                                key={document.id}
                                title={[
                                  document.fileName,
                                  createdAt ? `Added ${createdAt}` : "Added date unknown",
                                  document.shortSummary || "No summary yet"
                                ].join("\n")}
                                onClick={() => setPreviewDocument(document)}
                              >
                                <span
                                  className="leadDocumentCardBadge"
                                  style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                                >
                                  {extension.slice(0, 3)}
                                </span>
                                <span className="leadDocumentCardMain">
                                  <strong>{displayLabel}</strong>
                                  <span>{createdAt ?? "Date unknown"}</span>
                                </span>
                                <span className="detailsDocumentCardSummary">{document.shortSummary || "No summary yet"}</span>
                              </button>
                            );
                          })}
                          {detailsPanelExtraDocuments.length > 0 ? (
                            <details className="detailsExtraDownloads">
                              <summary>
                                Show all {detailsPanelDocuments.length} documents
                                <i aria-hidden="true" />
                              </summary>
                              <div className="leadDocumentCardList">
                                {detailsPanelExtraDocuments.map((document, extraIndex) => {
                                  const documentIndex = extraIndex + 3;
                                  const extension = documentExtensionLabel(document.fileName, document.mimeType);
                                  const createdAt = formatDocumentHistoryTimestamp(document.createdAt);
                                  const displayLabel = documentListDisplayLabel(detailsPanelDocuments, documentIndex);
                                  return (
                                    <button
                                      type="button"
                                      className="leadDocumentCard detailsDocumentCard"
                                      key={document.id}
                                      title={[
                                        document.fileName,
                                        createdAt ? `Added ${createdAt}` : "Added date unknown",
                                        document.shortSummary || "No summary yet"
                                      ].join("\n")}
                                      onClick={() => setPreviewDocument(document)}
                                    >
                                      <span
                                        className="leadDocumentCardBadge"
                                        style={{ "--document-color": documentBadgeColor(extension) } as ComponentProps<"span">["style"]}
                                      >
                                        {extension.slice(0, 3)}
                                      </span>
                                      <span className="leadDocumentCardMain">
                                        <strong>{displayLabel}</strong>
                                        <span>{createdAt ?? "Date unknown"}</span>
                                      </span>
                                      <span className="detailsDocumentCardSummary">{document.shortSummary || "No summary yet"}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      ) : (
                        <p className="detailsDrawerEmpty">No documents linked to this record yet.</p>
                      )}
                    </section>
                  ) : null}

                  {detailsPanelSummary ? (
                    <section className="detailsDrawerSection detailsSummarySection">
                      <span>Summary{detailsPanelSummary.updatedAt ? ` | ${readableDateTimeLabel(detailsPanelSummary.updatedAt)}` : ""}</span>
                      {detailsPanelSummary.long ? (
                        <details className="detailsDrawerDetails detailsSummaryDetails">
                          <summary>
                            <p className="detailsDrawerSummary">{detailsPanelSummary.short}</p>
                          </summary>
                          <p>{detailsPanelSummary.long}</p>
                          {leadSummariesEndpoint ? (
                            <button type="button" onClick={() => openLeadSummaryHistory(detailsPanelRow)}>
                              History
                            </button>
                          ) : null}
                        </details>
                      ) : (
                        <p className="detailsDrawerSummary">{detailsPanelSummary.short}</p>
                      )}
                    </section>
                  ) : null}

                  {hasDetailsCalendarSection ? (
                    <details className="detailsDrawerDetails">
                      <summary>
                        History: {detailsPanelCalendarItems.length} calendar {detailsPanelCalendarItems.length === 1 ? "item" : "items"}
                      </summary>
                      {detailsPanelCalendarItems.length > 0 ? (
                        <ul className="detailsDrawerTimeline">
                          {detailsPanelCalendarItems.map((item) => (
                            <li key={`${item.kind}-${item.id}`}>
                              <time>{calendarDateLabel(item.startsAt)} {calendarTimeLabel(item.startsAt)}</time>
                              <strong>{item.title}</strong>
                              <span>{[item.kind, item.status, item.sourceChannel].filter(Boolean).join(" | ")}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="detailsDrawerEmpty">No calendar history yet.</p>
                      )}
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
            <footer>
              <button type="button" onClick={() => setDetailsPanel(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={saveDetailsPanel} disabled={detailsPanel.saving}>
                {detailsPanel.saving ? "Saving" : "Save details"}
              </button>
            </footer>
          </section>
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
                : `${cellDeleteTarget.item.title} | ${calendarDayMonthLabel(cellDeleteTarget.item.startsAt)} ${calendarTimeLabel(cellDeleteTarget.item.startsAt)}`}
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
      {bulkActionDialog === "archive" ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setBulkActionDialog(null)}>
          <section className="bulkActionDialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Archive record</span>
                <h2>{selectedRows.length === 1 ? "Move this record to archive?" : `Move ${selectedRows.length} records to archive?`}</h2>
              </div>
              <button type="button" onClick={() => setBulkActionDialog(null)} aria-label="Close archive dialog">
                <X size={18} />
              </button>
            </header>
            <p>Archived leads stay visible at the bottom of the table in a muted state.</p>
            <footer>
              <button type="button" onClick={() => setBulkActionDialog(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirmArchiveSelectedRows("regular")}>
                Archive
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {bulkActionDialog === "spicyArchive" ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setBulkActionDialog(null)}>
          <section className="bulkActionDialog spicyArchiveDialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Final archive</span>
                <h2>{selectedRows.length === 1 ? "Send this lead to В утиль?" : `Send ${selectedRows.length} leads to В утиль?`}</h2>
              </div>
              <button type="button" onClick={() => setBulkActionDialog(null)} aria-label="Close final archive dialog">
                <X size={18} />
              </button>
            </header>
            <p>The lead stays at the bottom, greyed out, with a small “В утиле” status marker.</p>
            <footer>
              <button type="button" onClick={() => setBulkActionDialog(null)}>
                Cancel
              </button>
              <button type="button" className="spicy" onClick={() => void confirmArchiveSelectedRows("spicy")}>
                <Flame size={14} />
                В утиль
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
                    {summaryItem.source ? ` | ${summaryItem.source}` : ""}
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
        <div className="documentModalBackdrop documentPreviewBackdrop" role="presentation" onMouseDown={() => setPreviewDocument(null)}>
          <section className="documentModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>{documentExtensionLabel(previewDocument.fileName, previewDocument.mimeType)}</span>
                <h2>{previewDocument.fileName}</h2>
              </div>
              <button type="button" onClick={() => setPreviewDocument(null)} aria-label="Close document preview">
                <X size={18} />
              </button>
            </header>
            <div className="documentPreviewSummaries">
              <section>
                <strong>Summary</strong>
                <p>{previewDocument.shortSummary || "No summary yet."}</p>
              </section>
              {previewDocument.longSummary ? (
                <section>
                  <strong>Full summary</strong>
                  <p>{previewDocument.longSummary}</p>
                </section>
              ) : null}
            </div>
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
                <X size={18} />
              </button>
            </header>
            {createRecord.fields.map((field) => (
              <label className={field.multiline ? "formField wide" : "formField"} key={field.id}>
                <span>{field.label}</span>
                {field.id === "firstTouchChannel" ? (
                  <select
                    value={createValues[field.id] ?? ""}
                    onChange={(event) => setCreateValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    required={field.required}
                  >
                    {firstTouchChannelOptions.map((option) => (
                      <option key={option.value || "auto"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.multiline ? (
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
    </section>
  );
}
