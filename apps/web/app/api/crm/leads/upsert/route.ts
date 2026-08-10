import { NextResponse } from "next/server";
import { z } from "zod";
import { dateString, getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";
import { maybeAutoGenerateCommercialOfferForLead } from "../commercial-offers";

const optionalLeadLanguage = z.preprocess(
  (value) => (value === "" || value === "auto" ? null : value),
  z.enum(["de", "ru", "en"]).nullable().optional()
);

const schema = z.object({
  id: z.string().optional(),
  workspaceId,
  clientId: optionalText,
  name: z.string().trim().min(1),
  email: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  company: optionalText,
  status: z.enum(["new", "contacted", "qualified", "lost", "converted", "archived"]).optional(),
  sourceChannel: optionalText,
  externalThreadId: optionalText,
  externalMessageId: optionalText,
  notes: optionalText,
  progressStage: z.number().int().min(0).max(7).optional(),
  preferredLanguage: optionalLeadLanguage,
  contractNumber: optionalText,
  expectedFeeNet: z.number().finite().nullable().optional(),
  olegPercent: z.number().finite().nullable().optional(),
  handoffNote: optionalText,
  lastPingAt: dateString.nullable().optional(),
  clientType: optionalText
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const crm = getCrm();
    const lead = await crm.upsertLeadWithClientResolution(input);
    const autoOffer = await maybeAutoGenerateCommercialOfferForLead({
      crm,
      workspaceId: lead.workspaceId,
      leadId: lead.id
    });
    return NextResponse.json({ ...lead, autoOffer });
  } catch (error) {
    return handleRouteError(error);
  }
}
