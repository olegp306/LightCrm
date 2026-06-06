import { describe, expect, it } from "vitest";
import {
  applyTablePreferences,
  recordsToRows,
  sortRows,
  toCsv,
  updateRowCell
} from "./table-model";
import type { CrmTableColumn, CrmTableRow } from "./CrmTable";

const columns: CrmTableColumn[] = [
  { id: "name", title: "Name", width: 180 },
  { id: "client.name", title: "Client name", width: 180 },
  { id: "status", title: "Status", width: 120 }
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
        hidden: ["client.name"]
      })
    ).toEqual([
      { id: "status", title: "Status", width: 120 },
      { id: "name", title: "Name", width: 260 }
    ]);
  });

  it("sorts rows by a selected column in both directions", () => {
    expect(sortRows(rows, { columnId: "name", direction: "asc" }).map((row) => row.id)).toEqual(["1", "2"]);
    expect(sortRows(rows, { columnId: "client.name", direction: "desc" }).map((row) => row.id)).toEqual(["2", "1"]);
  });

  it("maps nested linked records to dotted table columns", () => {
    expect(
      recordsToRows(
        [
          {
            id: "lead-1",
            name: "Lead Person",
            status: "new",
            client: { name: "Client Person" }
          }
        ],
        columns
      )[0]
    ).toEqual({
      id: "lead-1",
      values: {
        name: "Lead Person",
        "client.name": "Client Person",
        status: "new"
      }
    });
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
