import { NextResponse } from "next/server";
import { handleRouteError } from "../../_shared";
import {
  fallbackHonorartabelle2026,
  getCrmRuntimeSettings,
  parseFeeTableText,
  updateCrmRuntimeSettings
} from "../crm-settings-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Fee table file is required");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString("utf8");
    const parsedRows = parseFeeTableText(text);
    const rows = parsedRows.length > 0 ? parsedRows : fallbackHonorartabelle2026();
    const current = await getCrmRuntimeSettings();
    const settings = await updateCrmRuntimeSettings({
      ...current,
      commercialOffers: {
        ...current.commercialOffers,
        activeFeeTable: {
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          year: 2026,
          rows,
          source: parsedRows.length > 0 ? "parsed" : "fallback"
        }
      }
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
