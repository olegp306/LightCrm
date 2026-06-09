"use client";

import "@glideapps/glide-data-grid/dist/index.css";
import {
  DataEditor,
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type Item
} from "@glideapps/glide-data-grid";
import { Check, Columns3, Download, Plus, Search } from "lucide-react";
import type { ComponentProps, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyTablePreferences,
  compactDocumentTitle,
  documentExtensionLabel,
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
  valueKind?: "text" | "link" | "documents";
};

export type DocumentCellItem = {
  id: string;
  fileName: string;
  shortSummary: string;
  longSummary: string | null;
  downloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type DocumentCellValue = DocumentCellItem[];

export type CrmTableCellValue = string | number | null | DocumentCellValue;

export type CrmTableRow = {
  id: string;
  values: Record<string, CrmTableCellValue>;
};

export type CrmTableProps = {
  title: string;
  description: string;
  columns: CrmTableColumn[];
  rows: CrmTableRow[];
  tableKey?: string;
  documentUploadEndpoint?: string;
};

type DocumentsCustomCell = CustomCell<{
  kind: "documents-cell";
  documents: DocumentCellValue;
}>;

type DocumentCellAction = { type: "open"; index: number } | { type: "upload" } | null;

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

const documentChipWidth = 84;
const documentChipGap = 8;
const documentChipHeight = 32;
const documentUploadWidth = 30;

function documentCellActionAt(x: number, documents: DocumentCellValue): DocumentCellAction {
  const documentArea = documents.length * (documentChipWidth + documentChipGap);
  if (x >= documentArea && x <= documentArea + documentUploadWidth) {
    return { type: "upload" };
  }
  const index = Math.floor(x / (documentChipWidth + documentChipGap));
  const chipStart = index * (documentChipWidth + documentChipGap);
  if (index >= 0 && index < documents.length && x >= chipStart && x <= chipStart + documentChipWidth) {
    return { type: "open", index };
  }
  return null;
}

function documentCellDisplayData(documents: DocumentCellValue): string {
  return documents.map((document) => document.fileName).join(", ");
}

function cellDocuments(value: CrmTableCellValue | undefined): DocumentCellValue {
  return Array.isArray(value) ? value : [];
}

function mobileDisplayValue(value: CrmTableCellValue | undefined): string | number {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => compactDocumentTitle(item.fileName)).join(", ") : "n/a";
  }
  return value ?? "n/a";
}

const documentCellRenderer: CustomRenderer<DocumentsCustomCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell): cell is DocumentsCustomCell =>
    cell.data && typeof cell.data === "object" && "kind" in cell.data && cell.data.kind === "documents-cell",
  needsHover: true,
  needsHoverPosition: true,
  draw: (args, cell) => {
    const { ctx, rect, theme, hoverX } = args;
    const documents = cell.data.documents;
    const top = rect.y + Math.max(5, Math.floor((rect.height - documentChipHeight) / 2));
    let left = rect.x + 8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    for (const [index, document] of documents.entries()) {
      const localX = hoverX === undefined ? -1 : hoverX - 8;
      const action = documentCellActionAt(localX, documents);
      const hovered = action?.type === "open" && action.index === index;
      const extension = documentExtensionLabel(document.fileName, document.mimeType);
      ctx.fillStyle = hovered ? "#e6f4f1" : "#f8fafc";
      ctx.strokeStyle = hovered ? "#0f766e" : "#d0d7e2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left, top, documentChipWidth, documentChipHeight, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = extension === "PDF" ? "#b42318" : extension === "XLS" ? "#15803d" : "#475467";
      ctx.beginPath();
      ctx.roundRect(left + 6, top + 6, 26, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 8px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(extension.slice(0, 4), left + 19, top + 16);

      ctx.fillStyle = theme.textDark;
      ctx.font = "500 10px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(compactDocumentTitle(document.fileName), left + 38, top + 17, documentChipWidth - 42);
      left += documentChipWidth + documentChipGap;
    }

    const localX = hoverX === undefined ? -1 : hoverX - 8;
    const uploadHovered = documentCellActionAt(localX, documents)?.type === "upload";
    ctx.fillStyle = uploadHovered ? "#e6f4f1" : "#ffffff";
    ctx.strokeStyle = uploadHovered ? "#0f766e" : "#d0d7e2";
    ctx.beginPath();
    ctx.roundRect(left, top + 3, 26, 26, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0f766e";
    ctx.font = "600 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("+", left + 13, top + 16);
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
  documentUploadEndpoint
}: CrmTableProps) {
  const [query, setQuery] = useState("");
  const storageKey = `lightcrm.table.${tableKey}`;
  const [preferences, setPreferences] = useState<TablePreferences>(() => defaultPreferences(columns));
  const [sort, setSort] = useState<TableSort | null>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [editableRows, setEditableRows] = useState<CrmTableRow[]>(rows);
  const [relatedTooltip, setRelatedTooltip] = useState<{ left: number; top: number } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentCellItem | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ rowId: string } | null>(null);
  const [uploadSummary, setUploadSummary] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
      if (column?.valueKind === "documents") {
        const documents = cellDocuments(value);
        return {
          kind: GridCellKind.Custom,
          data: { kind: "documents-cell", documents },
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
          themeOverride,
          onClickUri: (args) => {
            args.preventDefault();
            openTableLink(href);
          }
        };
      }
      return {
        kind: GridCellKind.Text,
        data: Array.isArray(value) ? documentCellDisplayData(value) : String(value),
        displayData: Array.isArray(value) ? documentCellDisplayData(value) : String(value),
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

  const handleCellClicked = useCallback(
    ([columnIndex, rowIndex]: Item, event: Parameters<NonNullable<ComponentProps<typeof DataEditor>["onCellClicked"]>>[1]) => {
      const column = configuredColumns[columnIndex];
      const row = filteredRows[rowIndex];
      if (!column || !row || column.valueKind !== "documents") {
        return;
      }
      event.preventDefault();
      const documents = cellDocuments(row.values[column.id]);
      const relativeX =
        event.localEventX <= event.bounds.width ? event.localEventX - 8 : event.localEventX - event.bounds.x - 8;
      const action = documentCellActionAt(relativeX, documents);
      if (action?.type === "open") {
        setPreviewDocument(documents[action.index] ?? null);
      }
      if (action?.type === "upload") {
        setUploadTarget({ rowId: row.id });
        setUploadSummary("");
        setUploadError(null);
      }
    },
    [configuredColumns, filteredRows]
  );

  const submitDocumentUpload = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!uploadTarget || !documentUploadEndpoint) {
        return;
      }
      const form = event.currentTarget;
      const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
      const file = fileInput?.files?.[0];
      if (!file) {
        setUploadError("Choose a file.");
        return;
      }
      const body = new FormData();
      body.set("leadId", uploadTarget.rowId);
      body.set("summary", uploadSummary);
      body.set("sourceChannel", "web");
      body.set("file", file);
      setIsUploading(true);
      setUploadError(null);
      try {
        const response = await fetch(documentUploadEndpoint, { method: "POST", body });
        const payload = (await response.json()) as { documents?: DocumentCellValue; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Upload failed.");
        }
        const uploaded = payload.documents?.[0];
        if (uploaded) {
          setEditableRows((current) =>
            current.map((row) =>
              row.id === uploadTarget.rowId
                ? {
                    ...row,
                    values: {
                      ...row.values,
                      documents: [...(Array.isArray(row.values.documents) ? row.values.documents : []), uploaded]
                    }
                  }
                : row
            )
          );
        }
        setUploadTarget(null);
        setUploadSummary("");
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        setIsUploading(false);
      }
    },
    [documentUploadEndpoint, uploadSummary, uploadTarget]
  );

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
          onCellClicked={handleCellClicked}
          customRenderers={[documentCellRenderer]}
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
                <strong>{mobileDisplayValue(row.values[column.id])}</strong>
              </div>
            ))}
          </article>
        ))}
      </div>
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
            <footer>
              {previewDocument.downloadUrl ? (
                <a href={previewDocument.downloadUrl} download={previewDocument.fileName}>
                  Download
                </a>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
      {uploadTarget ? (
        <div className="documentModalBackdrop" role="presentation" onMouseDown={() => setUploadTarget(null)}>
          <form className="documentModal documentUploadForm" onSubmit={submitDocumentUpload} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>ADD</span>
                <h2>Add document</h2>
              </div>
              <button type="button" onClick={() => setUploadTarget(null)} aria-label="Close upload form">
                ×
              </button>
            </header>
            <label>
              <span>File</span>
              <input name="file" type="file" required />
            </label>
            <label>
              <span>Summary</span>
              <textarea
                value={uploadSummary}
                onChange={(event) => setUploadSummary(event.target.value)}
                placeholder="Short file summary"
                rows={3}
              />
            </label>
            {uploadError ? <p className="documentUploadError">{uploadError}</p> : null}
            <footer>
              <button type="button" onClick={() => setUploadTarget(null)}>
                Cancel
              </button>
              <button type="submit" disabled={isUploading || !documentUploadEndpoint}>
                {isUploading ? "Uploading" : "Upload"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
