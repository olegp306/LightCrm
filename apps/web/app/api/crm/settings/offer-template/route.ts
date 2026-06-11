import { NextResponse } from "next/server";
import { handleRouteError } from "../../_shared";
import {
  extractDocxPlaceholders,
  getCrmRuntimeSettings,
  saveActiveOfferTemplate,
  updateCrmRuntimeSettings
} from "../crm-settings-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("DOCX template file is required");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const placeholders = extractDocxPlaceholders(buffer);
    const storagePath = await saveActiveOfferTemplate(buffer);
    const current = await getCrmRuntimeSettings();
    const settings = await updateCrmRuntimeSettings({
      ...current,
      commercialOffers: {
        ...current.commercialOffers,
        activeTemplate: {
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          placeholders,
          storagePath
        }
      }
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
