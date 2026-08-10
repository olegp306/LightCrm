import type {
  CalendarCellItem,
  CalendarCellValue,
  CrmTableCellValue,
  CrmTableColumn,
  CrmTableRow,
  DocumentCellItem,
  DocumentCellValue
} from "./CrmTable";

export type SortDirection = "asc" | "desc";

export type TableSort = {
  columnId: string;
  direction: SortDirection;
};

export type TablePreferences = {
  order?: string[];
  widths?: Record<string, number>;
  hidden?: string[];
  fontScale?: number;
  tableColor?: string;
  handoffBall?: "football" | "basketball" | "volleyball" | "potato";
  handoffSoundEnabled?: boolean;
  columnTextStyles?: Record<string, ColumnTextStyle>;
};

export type ColumnTextStyle = {
  weight?: "medium" | "super";
  /**
   * Legacy preference shape kept so saved localStorage from the first column-style build still works.
   */
  bold?: boolean;
  italic?: boolean;
};

function normalizeColumnTextStyle(style: ColumnTextStyle | undefined): ColumnTextStyle | undefined {
  if (!style) {
    return undefined;
  }
  const weight = style.weight ?? (style.bold ? "super" : undefined);
  if (!weight && !style.italic) {
    return undefined;
  }
  return {
    ...(weight ? { weight } : {}),
    ...(style.italic ? { italic: true } : {})
  };
}

export type ApiRecord = Record<string, unknown> & {
  id: string;
};

export type CreateRecordFieldValue = string | number | null;

export type OutreachProtocolItem = {
  id: string;
  actor?: string | null;
  channel: string | null;
  occurredAt: string | null;
  direction: string | null;
  outcome: string | null;
  subject?: string | null;
};

export type CurrentTouchChipTone = {
  fill: string;
  stroke: string;
  text: string;
  dot: string;
};

export type HandoffVisualTone = {
  accent: string;
  glow: string;
  soft: string;
};

export type CreateRecordPayloadConfig = {
  workspaceId?: string;
  payloadMap?: Record<string, string>;
  noteFields?: Record<string, string>;
};

function valueAtPath(record: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, record);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizedFilterLabel(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function channelLabel(value: string | null | undefined): string {
  switch (value?.toLocaleLowerCase()) {
    case "email":
      return "Email";
    case "linkedin":
      return "LinkedIn";
    case "phone":
      return "Call";
    default:
      return value?.trim() || "Touch";
  }
}

export function filterRowsByCountry(rows: CrmTableRow[], country: string): CrmTableRow[] {
  const selectedCountry = normalizedFilterLabel(country);
  if (!selectedCountry) {
    return rows;
  }
  return rows.filter((row) => normalizedFilterLabel(row.values.country) === selectedCountry);
}

export function formatOutreachProtocolItem(item: OutreachProtocolItem): string {
  const occurredAt = item.occurredAt ? new Date(item.occurredAt) : null;
  const dateLabel =
    occurredAt && !Number.isNaN(occurredAt.getTime())
      ? occurredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "No date";
  return [item.actor, channelLabel(item.channel), dateLabel, item.direction, item.outcome].filter(Boolean).join(" | ");
}

export function currentTouchChipTone(value: CrmTableCellValue | undefined): CurrentTouchChipTone | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text === "n/a") {
    return null;
  }
  return {
    fill: "#e7f0ff",
    stroke: "#9bbcfb",
    text: "#1f5aa6",
    dot: "#3478f6"
  };
}

export function handoffSideTone(side: "us" | "client"): HandoffVisualTone {
  return side === "client"
    ? {
        accent: "#d9468f",
        glow: "rgba(217, 70, 143, 0.34)",
        soft: "rgba(217, 70, 143, 0.16)"
      }
    : {
        accent: "#4f7df3",
        glow: "rgba(79, 125, 243, 0.28)",
        soft: "rgba(79, 125, 243, 0.14)"
      };
}

function displaySourceChannel(value: string | null): string | null {
  return value?.toLocaleLowerCase() === "telegram" ? "TG" : value;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeDocumentCellValue(value: unknown): DocumentCellValue {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): DocumentCellItem[] => {
    if (!isRecord(item)) {
      return [];
    }
    const id = optionalString(item.id);
    const fileName = optionalString(item.fileName);
    const shortSummary = optionalString(item.shortSummary);
    if (!id || !fileName) {
      return [];
    }
    const document: DocumentCellItem = {
      id,
      fileName,
      shortSummary: shortSummary ?? fileName,
      longSummary: optionalString(item.longSummary),
      downloadUrl: optionalString(item.downloadUrl),
      mimeType: optionalString(item.mimeType),
      sizeBytes: optionalNumber(item.sizeBytes)
    };
    const createdAt = optionalString(item.createdAt);
    if (createdAt) {
      document.createdAt = createdAt;
    }
    return [document];
  });
}

export function normalizeCalendarCellValue(value: unknown): CalendarCellValue {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): CalendarCellItem[] => {
    if (!isRecord(item)) {
      return [];
    }
    const id = optionalString(item.id);
    const kind = optionalString(item.kind);
    const title = optionalString(item.title);
    const startsAt = optionalString(item.startsAt);
    if (!id || !title || !startsAt || (kind !== "reminder" && kind !== "event")) {
      return [];
    }
    return [
      {
        id,
        kind,
        title,
        startsAt,
        endsAt: optionalString(item.endsAt),
        status: optionalString(item.status),
        sourceChannel: displaySourceChannel(optionalString(item.sourceChannel))
      }
    ];
  });
}

export function normalizeOutreachProtocolValue(value: unknown): OutreachProtocolItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): OutreachProtocolItem[] => {
    if (!isRecord(item)) {
      return [];
    }
    const id = optionalString(item.id);
    const channel = optionalString(item.channel);
    const occurredAt = optionalString(item.occurredAt);
    if (!id || !channel || !occurredAt) {
      return [];
    }
    return [
      {
        id,
        actor: optionalString(item.actor),
        channel,
        occurredAt,
        direction: optionalString(item.direction),
        outcome: optionalString(item.outcome),
        subject: optionalString(item.subject)
      }
    ];
  });
}

export function formatTableValue(value: unknown): CrmTableCellValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

export function formatAreaValue(value: CrmTableCellValue | undefined): string {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "—" || raw === "-") {
    return "—";
  }
  const numeric = Number(raw.replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return raw.includes("m²") || raw.includes("м²") ? raw : `${raw} m²`;
  }
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 1
  }).format(numeric);
  return `${formatted} m²`;
}

export function nextActionStateForTodo(value: string): string {
  return value.trim() ? "crm" : "neutral";
}

export function shouldWrapTableColumn(column: CrmTableColumn | undefined): boolean {
  return Boolean(column?.wrapText);
}

export function wrapMeasuredTextLines(
  text: string,
  maxWidth: number,
  maxLines: number,
  measureTextWidth: (value: string) => number
): { lines: string[]; overflow: boolean } {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lineLimit = Math.max(1, Math.floor(maxLines));
  if (words.length === 0) {
    return { lines: [], overflow: false };
  }
  const lines: string[] = [];
  let currentLine = "";
  let overflow = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (measureTextWidth(candidate) <= maxWidth || !currentLine) {
      currentLine = candidate;
      continue;
    }
    if (lines.length >= lineLimit - 1) {
      overflow = true;
      break;
    }
    lines.push(currentLine);
    currentLine = word;
  }
  if (currentLine && lines.length < lineLimit) {
    lines.push(currentLine);
  }
  return { lines, overflow };
}

export type LeadProgressStep = {
  id: "lead-filled" | "first-message" | "client-replied" | "reward";
  label: string;
  done: boolean;
};

function cellText(value: CrmTableCellValue | undefined): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseCurrencyLikeValue(value: CrmTableCellValue | undefined): number | null {
  const text = cellText(value);
  if (!text) {
    return null;
  }
  const match = text.match(/\d[\d\s.,']*/);
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
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function leadProgressReward(row: CrmTableRow, offerTotalGross?: number | null): string {
  const value = offerTotalGross ?? parseCurrencyLikeValue(row.values.budgetEur);
  if (!value) {
    return "—";
  }
  return `${Math.round(value).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €`;
}

export function leadProgressSteps(row: CrmTableRow, offerTotalGross?: number | null): LeadProgressStep[] {
  const hasLeadIdentity = Boolean(
    cellText(row.values.projectName) ?? cellText(row.values.name) ?? cellText(row.values["client.name"])
  );
  const hasLeadBrief = Boolean(cellText(row.values.description) ?? cellText(row.values.area) ?? cellText(row.values.address));
  const status = cellText(row.values.status)?.toLocaleLowerCase() ?? "";
  const source = cellText(row.values.source);
  const handoffSide = cellText(row.values.ball)?.toLocaleLowerCase();
  const hasReward = leadProgressReward(row, offerTotalGross) !== "—";

  return [
    { id: "lead-filled", label: "Lead filled", done: hasLeadIdentity && hasLeadBrief },
    { id: "first-message", label: "First message", done: Boolean(source) || /contact|sent|message|outreach/.test(status) },
    { id: "client-replied", label: "Client replied", done: handoffSide === "client" || /reply|respond|qualified|warm|hot/.test(status) },
    { id: "reward", label: "Reward", done: hasReward }
  ];
}

export function recordToRow(record: ApiRecord, columns: CrmTableColumn[]): CrmTableRow {
  const values = Object.fromEntries(
    columns.map((column) => {
      const value = valueAtPath(record, column.id);
      if (column.valueKind === "documents") {
        return [column.id, normalizeDocumentCellValue(value)];
      }
      if (column.valueKind === "calendar") {
        return [column.id, normalizeCalendarCellValue(value)];
      }
      return [column.id, formatTableValue(value)];
    })
  );
  if ("outreachProtocol" in record) {
    values.outreachProtocol = normalizeOutreachProtocolValue(record.outreachProtocol);
  }
  return {
    id: record.id,
    values
  };
}

export function recordsToRows(records: ApiRecord[], columns: CrmTableColumn[]): CrmTableRow[] {
  return records.map((record) => recordToRow(record, columns));
}

export function buildCreateRecordPayload(
  values: Record<string, CreateRecordFieldValue>,
  config: CreateRecordPayloadConfig = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    workspaceId: config.workspaceId ?? "default"
  };
  const notes: string[] = [];
  for (const [fieldId, rawValue] of Object.entries(values)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === null || value === "") {
      continue;
    }
    const noteLabel = config.noteFields?.[fieldId];
    if (noteLabel) {
      notes.push(`${noteLabel}: ${value}`);
    }
    const payloadKey = config.payloadMap?.[fieldId] ?? fieldId;
    if (!fieldId.includes(".") && !noteLabel) {
      payload[payloadKey] = value;
    } else if (config.payloadMap?.[fieldId]) {
      payload[payloadKey] = value;
    }
  }
  if (notes.length > 0) {
    payload.notes = notes.join("\n\n");
  }
  return payload;
}

export function applyTablePreferences(columns: CrmTableColumn[], preferences: TablePreferences): CrmTableColumn[] {
  const hidden = new Set(preferences.hidden ?? []);
  const byId = new Map(columns.map((column) => [column.id, column]));
  const orderedIds = [...(preferences.order ?? []), ...columns.map((column) => column.id)];
  const seen = new Set<string>();

  return orderedIds.flatMap((id) => {
    if (seen.has(id) || hidden.has(id)) {
      return [];
    }
    seen.add(id);
    const column = byId.get(id);
    if (!column) {
      return [];
    }
    const textStyle = normalizeColumnTextStyle(preferences.columnTextStyles?.[id]);
    return [
      {
        ...column,
        width: preferences.widths?.[id] ?? column.width,
        textStyle
      }
    ];
  });
}

function comparableValue(value: CrmTableCellValue | undefined): string | number | null {
  if (Array.isArray(value)) {
    return value.length;
  }
  return value ?? null;
}

function compareValues(left: CrmTableCellValue | undefined, right: CrmTableCellValue | undefined): number {
  const comparableLeft = comparableValue(left);
  const comparableRight = comparableValue(right);
  if (comparableLeft === comparableRight) {
    return 0;
  }
  if (comparableLeft === null) {
    return 1;
  }
  if (comparableRight === null) {
    return -1;
  }
  if (typeof comparableLeft === "number" && typeof comparableRight === "number") {
    return comparableLeft - comparableRight;
  }
  return String(comparableLeft).localeCompare(String(comparableRight), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows: CrmTableRow[], sort: TableSort | null): CrmTableRow[] {
  if (!sort) {
    return rows;
  }
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => direction * compareValues(left.values[sort.columnId], right.values[sort.columnId]));
}

export function updateRowCell(
  rows: CrmTableRow[],
  rowId: string,
  columnId: string,
  value: string | number | null
): CrmTableRow[] {
  return rows.map((row) =>
    row.id === rowId
      ? {
          ...row,
          values: { ...row.values, [columnId]: value }
        }
      : row
  );
}

export function documentExtensionLabel(fileName: string, mimeType?: string | null): string {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType?.toLowerCase() ?? "";
  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) {
    return "PDF";
  }
  if (lowerMime.includes("spreadsheet") || lowerMime.includes("excel") || /\.(xlsx|xls|csv)$/.test(lowerName)) {
    return "XLS";
  }
  if (lowerMime.includes("word") || /\.(docx|doc)$/.test(lowerName)) {
    return "DOC";
  }
  if (lowerMime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(lowerName)) {
    return "IMG";
  }
  if (lowerMime.startsWith("audio/") || /\.(ogg|mp3|wav|m4a)$/.test(lowerName)) {
    return "AUD";
  }
  const ext = lowerName.includes(".") ? lowerName.split(".").pop() : "";
  return (ext || "FILE").slice(0, 4).toUpperCase();
}

export function documentDisplayLabel(fileName: string, mimeType: string | null | undefined, sameTypeIndex = 0): string {
  const extension = documentExtensionLabel(fileName, mimeType);
  const label =
    extension === "IMG"
      ? "Picture"
      : extension === "AUD"
        ? "Audio"
        : extension === "XLS"
          ? "Sheet"
          : extension === "DOC"
            ? "DOC"
            : extension;
  return sameTypeIndex > 0 ? `${label} ${sameTypeIndex + 1}` : label;
}

export function compactDocumentTitle(fileName: string, maxLength = 20): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  if (base.length <= maxLength) {
    return base;
  }
  const remaining = Math.max(4, maxLength - 1);
  const head = Math.ceil(remaining / 2);
  const tail = Math.floor(remaining / 2);
  return `${base.slice(0, head)}…${base.slice(-tail)}`;
}

function csvEscape(value: CrmTableCellValue | undefined): string {
  const text = Array.isArray(value)
    ? value
        .map((item) =>
          "fileName" in item
            ? item.fileName
            : "startsAt" in item
              ? `${item.startsAt} ${item.title}`
              : formatOutreachProtocolItem(item)
        )
        .join("; ")
    : String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(columns: CrmTableColumn[], rows: CrmTableRow[]): string {
  return [
    columns.map((column) => csvEscape(column.title)).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row.values[column.id] ?? null)).join(","))
  ].join("\r\n");
}
