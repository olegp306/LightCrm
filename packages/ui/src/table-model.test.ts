import { describe, expect, it } from "vitest";
import {
  applyTablePreferences,
  buildCreateRecordPayload,
  compactDocumentTitle,
  documentDisplayLabel,
  documentExtensionLabel,
  formatAreaValue,
  leadProgressReward,
  leadProgressSteps,
  nextActionStateForTodo,
  recordToRow,
  recordsToRows,
  shouldWrapTableColumn,
  sortRows,
  toCsv,
  updateRowCell,
  wrapMeasuredTextLines
} from "./table-model";
import type { CrmTableColumn, CrmTableRow } from "./CrmTable";

const columns: CrmTableColumn[] = [
  { id: "name", title: "Name", width: 180 },
  { id: "client.name", title: "Client name", width: 180 },
  { id: "status", title: "Status", width: 120 },
  { id: "documents", title: "Documents", width: 260, valueKind: "documents" }
];

const rows: CrmTableRow[] = [
  { id: "2", values: { name: "Beta", "client.name": "Zed", status: "new" } },
  { id: "1", values: { name: "Alpha", "client.name": "Ada", status: "qualified" } }
];

describe("table-model", () => {
  it("applies saved order, width, and hidden column preferences", () => {
    expect(
      applyTablePreferences(columns, {
        order: ["status", "name"],
        widths: { name: 260 },
        hidden: ["client.name", "documents"]
      })
    ).toEqual([
      { id: "status", title: "Status", width: 120 },
      { id: "name", title: "Name", width: 260 }
    ]);
  });

  it("keeps table color preference separate from column layout", () => {
    expect(
      applyTablePreferences(columns, {
        order: ["client.name", "name"],
        widths: { "client.name": 210 },
        tableColor: "#bd7b8d"
      }).map((column) => [column.id, column.width])
    ).toEqual([
      ["client.name", 210],
      ["name", 180],
      ["status", 120],
      ["documents", 260]
    ]);
  });

  it("applies saved column text styles with other preferences", () => {
    expect(
      applyTablePreferences(columns, {
        widths: { name: 240 },
        columnTextStyles: {
          name: { weight: "medium" },
          "client.name": { bold: true },
          status: { weight: "super", italic: true },
          documents: { bold: false, italic: false }
        }
      }).map((column) => [column.id, column.width, column.textStyle])
    ).toEqual([
      ["name", 240, { weight: "medium" }],
      ["client.name", 180, { weight: "super" }],
      ["status", 120, { weight: "super", italic: true }],
      ["documents", 260, undefined]
    ]);
  });

  it("sorts rows by a selected column in both directions", () => {
    expect(sortRows(rows, { columnId: "name", direction: "asc" }).map((row) => row.id)).toEqual(["1", "2"]);
    expect(sortRows(rows, { columnId: "client.name", direction: "desc" }).map((row) => row.id)).toEqual(["2", "1"]);
  });

  it("keeps archived rows at the bottom after sorting", () => {
    const mixedRows = [
      { id: "archived", values: { name: "Aardvark", status: "archived", archivedAt: "2026-07-01T09:00:00.000Z" } },
      { id: "active", values: { name: "Zebra", status: "new", archivedAt: null } }
    ];

    expect(sortRows(mixedRows, { columnId: "name", direction: "asc" }).map((row) => row.id)).toEqual(["active", "archived"]);
  });

  it("maps nested linked records to dotted table columns", () => {
    const document = {
      id: "doc-1",
      fileName: "architectural-layout-final-version.pdf",
      shortSummary: "Floor plan",
      longSummary: "Detailed layout package.",
      downloadUrl: "/api/files/doc-1",
      mimeType: "application/pdf",
      sizeBytes: 1024
    };

    expect(
      recordsToRows(
        [
          {
            id: "lead-1",
            name: "Lead Person",
            status: "new",
            client: { name: "Client Person" },
            documents: [document]
          }
        ],
        columns
      )[0]
    ).toEqual({
      id: "lead-1",
      values: {
        name: "Lead Person",
        "client.name": "Client Person",
        status: "new",
        documents: [document]
      }
    });
  });

  it("maps a single API record to a table row", () => {
    expect(recordToRow({ id: "lead-1", name: "Lead Person", status: "new" }, columns)).toMatchObject({
      id: "lead-1",
      values: {
        name: "Lead Person",
        status: "new"
      }
    });
  });

  it("builds a create payload with mapped fields and note fields", () => {
    expect(
      buildCreateRecordPayload(
        {
          name: " Максим ",
          project: "Дом",
          description: " 140 m2 ",
          phone: null
        },
        {
          workspaceId: "workspace-1",
          payloadMap: { project: "company" },
          noteFields: { project: "Project", description: "Description" }
        }
      )
    ).toEqual({
      workspaceId: "workspace-1",
      name: "Максим",
      company: "Дом",
      notes: "Project: Дом\n\nDescription: 140 m2"
    });
  });

  it("maps dotted create fields when a visible linked column is used as the entry point", () => {
    expect(
      buildCreateRecordPayload(
        {
          "client.name": "Katya Client",
          "client.phone": "+49 123",
          "client.email": "katya@example.com",
          project: "House brief"
        },
        {
          payloadMap: { "client.name": "name", "client.phone": "phone", "client.email": "email", project: "company" },
          noteFields: { project: "Project" }
        }
      )
    ).toEqual({
      workspaceId: "default",
      name: "Katya Client",
      phone: "+49 123",
      email: "katya@example.com",
      company: "House brief",
      notes: "Project: House brief"
    });
  });

  it("formats document titles and extension labels for compact cells", () => {
    expect(documentExtensionLabel("brief.pdf", "application/pdf")).toBe("PDF");
    expect(documentExtensionLabel("budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("XLS");
    expect(compactDocumentTitle("architectural-layout-final-version.pdf")).toBe("architectu…l-version");
    expect(compactDocumentTitle("brief.pdf")).toBe("brief");
  });

  it("formats visible document links with readable type labels", () => {
    expect(documentDisplayLabel("telegram-photo-1866.jpg", "image/jpeg")).toBe("Picture");
    expect(documentDisplayLabel("telegram-photo-1867.jpg", "image/jpeg", 1)).toBe("Picture 2");
    expect(documentDisplayLabel("offer.pdf", "application/pdf")).toBe("PDF");
    expect(documentDisplayLabel("offer-final.pdf", "application/pdf", 1)).toBe("PDF 2");
  });

  it("formats lead area values with readable units", () => {
    expect(formatAreaValue("3609.000000000000000000000000000000")).toBe("3.609 m²");
    expect(formatAreaValue("100,5")).toBe("100,5 m²");
    expect(formatAreaValue("about 120")).toBe("about 120 m²");
    expect(formatAreaValue(null)).toBe("—");
  });

  it("derives next action state from editable Todo text", () => {
    expect(nextActionStateForTodo("manual review")).toBe("crm");
    expect(nextActionStateForTodo("   ")).toBe("neutral");
  });

  it("detects columns that should render with wrapped table text", () => {
    expect(shouldWrapTableColumn({ id: "client.name", title: "Client", wrapText: true })).toBe(true);
    expect(shouldWrapTableColumn({ id: "status", title: "Status" })).toBe(false);
  });

  it("fills the final wrapped table line before reporting overflow", () => {
    const measureTextWidth = (value: string) => value.length;

    expect(wrapMeasuredTextLines("aaaa bbbb cc dd", 10, 2, measureTextWidth)).toEqual({
      lines: ["aaaa bbbb", "cc dd"],
      overflow: false
    });
    expect(wrapMeasuredTextLines("aaaa bbbb cc dd eeeeeeeee", 10, 2, measureTextWidth)).toEqual({
      lines: ["aaaa bbbb", "cc dd"],
      overflow: true
    });
  });

  it("derives lead progress steps and reward from existing lead fields", () => {
    const row: CrmTableRow = {
      id: "lead-1",
      values: {
        projectName: "Villa brief",
        "client.name": "Ada",
        description: "New private house",
        source: "telegram",
        status: "contacted",
        ball: "client",
        budgetEur: "125000"
      }
    };

    expect(leadProgressSteps(row).map((step) => [step.id, step.done])).toEqual([
      ["lead-filled", true],
      ["first-message", true],
      ["client-replied", true],
      ["reward", true]
    ]);
    expect(leadProgressReward(row, 148750)).toBe("148.750 €");
  });

  it("exports visible columns and sorted rows to CSV", () => {
    expect(toCsv(columns.slice(0, 2), sortRows(rows, { columnId: "name", direction: "asc" }))).toBe(
      'Name,Client name\r\nAlpha,Ada\r\nBeta,Zed'
    );
  });

  it("updates one editable cell without mutating other rows", () => {
    const updated = updateRowCell(rows, "1", "client.name", "Adele");

    expect(updated).toEqual([
      rows[0],
      { id: "1", values: { name: "Alpha", "client.name": "Adele", status: "qualified" } }
    ]);
    expect(rows[1].values["client.name"]).toBe("Ada");
  });
});
