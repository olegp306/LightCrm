import { createCrmBackupModel, type CrmBackupCellValue, type CrmBackupSheet } from "@lightcrm/core";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { publicOriginFromRequest } from "../../../../auth/config";
import { defaultWorkspaceId, getCrm, handleRouteError, resolveWorkspaceId } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function backupFilename(workspaceId: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `lightcrm-backup-${workspaceId}-${stamp}.xlsx`;
}

function formatContentDisposition(filename: string) {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`;
}

function applyCellValue(cell: ExcelJS.Cell, header: string, value: CrmBackupCellValue, rowNumber: number) {
  if (header === "Сегодня") {
    cell.value = { formula: `INT(A${rowNumber})=TODAY()`, result: false };
    return;
  }
  if (typeof value === "string" && value.startsWith("=")) {
    cell.value = { formula: value.slice(1), result: false };
    return;
  }
  if (header === "CRM" && typeof value === "string" && value) {
    cell.value = { text: value, hyperlink: value };
    cell.font = { color: { argb: "FF2563EB" }, underline: true };
    return;
  }
  cell.value = value;
}

function applyWorksheetStyle(worksheet: ExcelJS.Worksheet, sheet: CrmBackupSheet) {
  const headers = sheet.headers;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(headers.length, 1) }
  };

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle" };

  worksheet.columns.forEach((column, index) => {
    const header = headers[index] ?? "";
    const values = sheet.rows.map((row) => row[header]);
    const maxLength = Math.max(
      header.length,
      ...values.map((value) => (value instanceof Date ? 16 : String(value ?? "").length))
    );
    column.width = Math.min(Math.max(maxLength + 2, 12), 42);
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } }
      };
      cell.alignment = { vertical: "top", wrapText: rowNumber > 1 };
      if (cell.value instanceof Date) {
        cell.numFmt = "dd.mm.yyyy hh:mm";
      }
    });
  });
}

async function writeWorkbook(sheetModel: ReturnType<typeof createCrmBackupModel>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LightCrm";
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const sheet of sheetModel.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    const headers = sheet.headers;
    worksheet.addRow(headers);
    for (const row of sheet.rows) {
      const worksheetRow = worksheet.addRow([]);
      headers.forEach((header, index) => {
        applyCellValue(worksheetRow.getCell(index + 1), header, row[header] ?? null, worksheetRow.number);
      });
    }
    applyWorksheetStyle(worksheet, sheet);
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = resolveWorkspaceId(url.searchParams.get("workspaceId") ?? defaultWorkspaceId);
    const crm = getCrm();
    const [clients, leads, reminders, calendarEvents, documentFiles] = await Promise.all([
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "lead", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "reminder", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "calendarEvent", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "documentFile", workspaceId, includeArchived: true })
    ]);
    const model = createCrmBackupModel({
      appBaseUrl: publicOriginFromRequest(request.headers, url.origin),
      clients,
      leads,
      reminders,
      calendarEvents,
      documentFiles
    });
    const body = await writeWorkbook(model);
    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": formatContentDisposition(backupFilename(workspaceId)),
        "Content-Type": contentType
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
