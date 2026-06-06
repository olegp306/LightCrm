"use client";

import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type Item
} from "@glideapps/glide-data-grid";
import { Check, Columns3, Download, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyTablePreferences,
  sortRows,
  toCsv,
  updateRowCell,
  type TablePreferences,
  type TableSort
} from "./table-model";

export type CrmTableColumn = {
  id: string;
  title: string;
  width?: number;
  defaultVisible?: boolean;
  mobilePriority?: number;
  group?: string;
  valueKind?: "text" | "link";
};

export type CrmTableRow = {
  id: string;
  values: Record<string, string | number | null>;
};

export type CrmTableProps = {
  title: string;
  description: string;
  columns: CrmTableColumn[];
  rows: CrmTableRow[];
  tableKey?: string;
};

function defaultPreferences(columns: CrmTableColumn[]): TablePreferences {
  return {
    order: columns.map((column) => column.id),
    widths: Object.fromEntries(columns.map((column) => [column.id, column.width ?? 160])),
    hidden: columns.filter((column) => column.defaultVisible === false).map((column) => column.id)
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

const relatedTableTheme = {
  bgCell: "#edf8f2",
  bgCellMedium: "#e2f2ea",
  textDark: "#12352a",
  textMedium: "#2f6b55"
};

const relatedTableHeaderTheme = {
  bgHeader: "#e1f2e9",
  bgHeaderHovered: "#d3eadf",
  textGroupHeader: "#0f6b46",
  textHeader: "#0f6b46"
};

const groupHeaderHeight = 20;
const rowMarkerWidth = 34;
const tableTheme = {
  headerFontStyle: "600 12px"
};

export function CrmTable({ title, description, columns, rows, tableKey = title.toLowerCase() }: CrmTableProps) {
  const [query, setQuery] = useState("");
  const storageKey = `lightcrm.table.${tableKey}`;
  const [preferences, setPreferences] = useState<TablePreferences>(() => defaultPreferences(columns));
  const [sort, setSort] = useState<TableSort | null>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [editableRows, setEditableRows] = useState<CrmTableRow[]>(rows);
  const [relatedTooltip, setRelatedTooltip] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setEditableRows(rows);
  }, [rows]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      setPreferences({ ...defaultPreferences(columns), ...(JSON.parse(saved) as TablePreferences) });
      return;
    }
    setPreferences(defaultPreferences(columns));
  }, [columns, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [preferences, storageKey]);

  const configuredColumns = useMemo(() => applyTablePreferences(columns, preferences), [columns, preferences]);
  const visibleColumns = useMemo<GridColumn[]>(
    () =>
      configuredColumns.map((column) => ({
        id: column.id,
        title: sort?.columnId === column.id ? `${column.title} ${sort.direction === "asc" ? "(asc)" : "(desc)"}` : column.title,
        width: column.width ?? 160,
        group: column.group,
        hasMenu: true
      })),
    [configuredColumns, sort]
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

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const column = configuredColumns[col];
      const record = filteredRows[row];
      const value = record?.values[String(column?.id)] ?? "";
      const themeOverride = column?.group === "Client" ? relatedTableTheme : undefined;
      if (column?.valueKind === "link" && value) {
        const href = String(value);
        return {
          kind: GridCellKind.Uri,
          data: href,
          displayData: column.id === "downloadUrl" ? "Download" : "Open",
          allowOverlay: true,
          hoverEffect: true,
          readonly: false,
          themeOverride,
          onClickUri: (args) => {
            args.preventDefault();
            openTableLink(href);
          }
        };
      }
      return {
        kind: GridCellKind.Text,
        data: String(value),
        displayData: String(value),
        allowOverlay: true,
        readonly: false,
        themeOverride
      };
    },
    [configuredColumns, filteredRows]
  );

  const handleItemHovered = useCallback((args: GridMouseEventArgs) => {
    if (args.kind === "group-header" && args.group === "Client") {
      setRelatedTooltip({
        left: args.bounds.x + Math.min(args.bounds.width / 2, 180),
        top: args.bounds.y + args.bounds.height + 8
      });
      return;
    }
    setRelatedTooltip(null);
  }, []);

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

  const editCell = useCallback((columnIndex: number, rowIndex: number, value: GridCell) => {
    const column = configuredColumns[columnIndex];
    const row = filteredRows[rowIndex];
    if (!column || !row || (value.kind !== GridCellKind.Text && value.kind !== GridCellKind.Uri)) {
      return;
    }
    setEditableRows((current) => updateRowCell(current, row.id, column.id, value.data));
  }, [configuredColumns, filteredRows]);

  const visibleColumnIds = new Set(configuredColumns.map((column) => column.id));
  const allColumnsByPreference = applyTablePreferences(columns, { ...preferences, hidden: [] });
  const mobileColumns = configuredColumns
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
        <div className="toolbar" aria-label={`${title} actions`}>
          <label className="searchBox">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
          </label>
          <button type="button" title="Create row" aria-label="Create row">
            <Plus size={16} />
          </button>
          <button
            type="button"
            title="Columns"
            aria-label="Columns"
            onClick={() => setShowColumnMenu((value) => !value)}
          >
            <Columns3 size={16} />
          </button>
          <button
            type="button"
            title="Export CSV"
            aria-label="Export CSV"
            onClick={() => downloadCsv(`${tableKey}.csv`, toCsv(configuredColumns, filteredRows))}
          >
            <Download size={16} />
          </button>
        </div>
      </header>
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
      <div className="gridFrame" onMouseLeave={() => setRelatedTooltip(null)}>
        {relatedTooltip ? (
          <div className="relatedTableTooltip" style={{ left: relatedTooltip.left, top: relatedTooltip.top }}>
            <strong>Related table</strong>
            <span>These columns show fields from the linked client record.</span>
          </div>
        ) : null}
        <DataEditor
          columns={visibleColumns}
          rows={filteredRows.length}
          getCellContent={getCellContent}
          onHeaderClicked={(columnIndex) => {
            const column = configuredColumns[columnIndex];
            if (column) {
              setSort((current) => nextSort(current, column.id));
            }
          }}
          onHeaderMenuClick={() => setShowColumnMenu((value) => !value)}
          onColumnMoved={moveColumn}
          onColumnResize={(_, width, columnIndex) => resizeColumnAtIndex(columnIndex, width)}
          onCellEdited={([columnIndex, rowIndex], value) => editCell(columnIndex, rowIndex, value)}
          getGroupDetails={(groupName) =>
            groupName === "Client"
              ? {
                  name: "Client",
                  overrideTheme: relatedTableHeaderTheme
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
          rowMarkers="number"
          theme={tableTheme}
          cellActivationBehavior="double-click"
          smoothScrollX
          smoothScrollY
        />
      </div>
      <div className="mobileTableList">
        {filteredRows.map((row) => (
          <article className="mobileTableRow" key={row.id}>
            {mobileColumns.map((column) => (
              <div key={column.id}>
                <span>{column.title}</span>
                <strong>{row.values[column.id] ?? "n/a"}</strong>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
