import { summarizeLeadIntake } from "@lightcrm/orchestrator";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../_shared";
import {
  allCommercialOfferAttachments,
  saveIncomingCommercialOfferAttachments
} from "./commercial-offer-documents";

const textItemSchema = z.object({
  sourceMessageId: optionalText,
  author: optionalText,
  text: z.string().trim().min(1)
});

const attachmentSchema = z.object({
  sourceMessageId: optionalText,
  kind: z.enum(["image", "pdf", "audio", "voice", "document", "other"]),
  fileName: z.string().trim().min(1),
  storageProvider: z.string().trim().min(1).optional(),
  storageBucket: optionalText,
  storageKey: z.string().trim().min(1),
  downloadUrl: optionalText,
  mimeType: optionalText,
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  summary: optionalText,
  longSummary: optionalText
});

const schema = z.object({
  workspaceId,
  leadId: z.string().trim().min(1),
  sourceChannel: optionalText,
  sourceThreadId: optionalText,
  sourceMessageId: optionalText,
  textItems: z.array(textItemSchema).optional(),
  attachments: z.array(attachmentSchema).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const attachments = input.attachments ?? [];
    if (allCommercialOfferAttachments(attachments)) {
      const { lead, documents } = await saveIncomingCommercialOfferAttachments({
        crm: getCrm(),
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        attachments
      });
      return NextResponse.json({
        lead,
        documents,
        leadSummary: null,
        summary: documents.map((document) => document.shortSummary).join("\n"),
        originalTakes: []
      });
    }
    const summary = summarizeLeadIntake(input);
    return NextResponse.json(
      await getCrm().ingestLeadIntake({
        ...input,
        attachments: input.attachments?.map((attachment, index) => ({
          ...attachment,
          summary: attachment.summary ?? summary.attachments[index]?.shortSummary ?? null,
          longSummary: attachment.longSummary ?? summary.attachments[index]?.longSummary ?? null
        }))
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
