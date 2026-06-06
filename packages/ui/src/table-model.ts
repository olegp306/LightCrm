import type { CrmTableColumn, CrmTableRow } from "./CrmTable";

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

export function formatTableValue(value: unknown): string | number | null {
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
    values: Object.fromEntries(columns.map((column) => [column.id, formatTableValue(valueAtPath(record, column.id))]))
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

function compareValues(left: string | number | null, right: string | number | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows: CrmTableRow[], sort: TableSort | null): CrmTableRow[] {
  if (!sort) {
    return rows;
  }
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => direction * compareValues(left.values[sort.columnId] ?? null, right.values[sort.columnId] ?? null));
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

function csvEscape(value: string | number | null): string {
  const text = String(value ?? "");
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
