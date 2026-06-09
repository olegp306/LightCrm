import type { CrmTableCellValue, CrmTableColumn, CrmTableRow, DocumentCellItem, DocumentCellValue } from "./CrmTable";

export type SortDirection = "asc" | "desc";

export type TableSort = {
  columnId: string;
  direction: SortDirection;
};

export type TablePreferences = {
  order?: string[];
  widths?: Record<string, number>;
  hidden?: string[];
};

export type ApiRecord = Record<string, unknown> & {
  id: string;
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
    return [
      {
        id,
        fileName,
        shortSummary: shortSummary ?? fileName,
        longSummary: optionalString(item.longSummary),
        downloadUrl: optionalString(item.downloadUrl),
        mimeType: optionalString(item.mimeType),
        sizeBytes: optionalNumber(item.sizeBytes)
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

export function recordsToRows(records: ApiRecord[], columns: CrmTableColumn[]): CrmTableRow[] {
  return records.map((record) => ({
    id: record.id,
    values: Object.fromEntries(
      columns.map((column) => {
        const value = valueAtPath(record, column.id);
        return [column.id, column.valueKind === "documents" ? normalizeDocumentCellValue(value) : formatTableValue(value)];
      })
    )
  }));
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
    return [{ ...column, width: preferences.widths?.[id] ?? column.width }];
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
  const text = Array.isArray(value) ? value.map((item) => item.fileName).join("; ") : String(value ?? "");
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
