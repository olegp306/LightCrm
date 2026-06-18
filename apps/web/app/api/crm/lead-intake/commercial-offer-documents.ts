import type { createCrmService, DocumentFile, LeadIntakeAttachmentInput } from "@lightcrm/core";

type CrmService = ReturnType<typeof createCrmService>;

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function looksLikeCommercialOffer(input: { fileName: string; summary?: string | null; longSummary?: string | null }): boolean {
  const haystack = [input.fileName, input.summary, input.longSummary].filter(Boolean).join(" ").toLocaleLowerCase();
  return /\b(kp|commercial offer|angebot|architektenleistungen|honorar|gesamthonorar|leistungsphase|leistungsphasen|lp\s*1\s*(?:-|to)\s*4)\b/.test(haystack);
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      return normalizeOfferValue(compactText(match[1], 120));
    }
  }
  return null;
}

function normalizeOfferValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/€/g, "EUR")
    .replace(/\beuro\b/gi, "EUR")
    .replace(/\bm2\b/gi, "m²")
    .replace(/\bqm\b/gi, "m²")
    .trim();
}

function extractCommercialOfferParameters(source: string) {
  const compact = source.replace(/\s+/g, " ").trim();
  const bgf = firstMatch(compact, [
    /\bBGF[:\s]+([0-9][0-9\s.,']*\s*(?:m2|m²|qm)?)/i,
    /\b(?:Area|Projektflaeche|Projektfläche)[:\s]+([0-9][0-9\s.,']*\s*(?:m2|m²|qm)?)/i
  ]);
  const wohnflaeche = firstMatch(compact, [
    /\b(?:Wohnflaeche|Wohnfläche)[:\s]+([0-9][0-9\s.,']*\s*(?:m2|m²|qm)?)/i
  ]);
  const lp1_3Net = firstMatch(compact, [
    /\bLP\s*1\s*-\s*3\s*net[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i
  ]);
  const lp4Net = firstMatch(compact, [/\bLP\s*4\s*net[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i]);
  const totalNet = firstMatch(compact, [
    /\bTotal\s+net[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i,
    /\b(?:Netto|Gesamthonorar\s+netto)[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i
  ]);
  const vat = firstMatch(compact, [
    /\b(?:VAT\s*19%|MwSt\.?\s*19%|MWST\s*19%)[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i
  ]);
  const totalGross = firstMatch(compact, [
    /\bTotal\s+gross[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i,
    /\b(?:Brutto|Gesamthonorar(?:\s+brutto)?|Honorar(?:\s+brutto)?)[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i
  ]);
  const paymentPlanMatch = compact.match(
    /\bPayment\s+plan\s+net[:\s]+30%\s*([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)\s+40%\s*([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)\s+30%\s*([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i
  );
  const paymentPlan = paymentPlanMatch
    ? `30% ${normalizeOfferValue(paymentPlanMatch[1])}, 40% ${normalizeOfferValue(paymentPlanMatch[2])}, 30% ${normalizeOfferValue(paymentPlanMatch[3])}`
    : null;
  return {
    bgf,
    wohnflaeche,
    lp1_3Net,
    lp4Net,
    totalNet,
    vat,
    totalGross,
    paymentPlan
  };
}

function nextCommercialOfferVersion(documents: DocumentFile[], leadId: string): number {
  const versions = documents
    .filter((document) => document.leadId === leadId && !document.archivedAt && looksLikeCommercialOffer(document))
    .map((document) => {
      const match = [document.shortSummary, document.fileName].join(" ").match(/\bV(\d+)/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return versions.length > 0 ? Math.max(...versions) + 1 : 1;
}

export function incomingCommercialOfferSummary(input: {
  version: number;
  fileName: string;
  label: string;
  summary?: string | null;
  longSummary?: string | null;
}) {
  const source = [input.summary, input.longSummary].filter(Boolean).join("\n");
  const parameters = extractCommercialOfferParameters(source);
  const parameterLines = [
    `Version: KP V${input.version} received.`,
    "Pricing mode: received.",
    `BGF: ${parameters.bgf ?? "to review"}.`,
    `Wohnflaeche: ${parameters.wohnflaeche ?? "to review"}.`,
    `LP 1-3 net: ${parameters.lp1_3Net ?? "to review"}.`,
    `LP 4 net: ${parameters.lp4Net ?? "to review"}.`,
    `Total net: ${parameters.totalNet ?? "to review"}.`,
    `VAT 19%: ${parameters.vat ?? "to review"}.`,
    `Total gross: ${parameters.totalGross ?? "to review"}.`,
    `Payment plan net: ${parameters.paymentPlan ?? "to review"}.`,
    `Summary: KP V${input.version} received/uploaded commercial offer. Use this summary to compare what was received from the client against generated draft versions.`
  ];
  const shortSummary = [
    `KP V${input.version} received`,
    `gross ${parameters.totalGross ?? "to review"}`,
    `BGF ${parameters.bgf ?? "to review"}`,
    `Wohnflaeche ${parameters.wohnflaeche ?? "to review"}`,
    "received"
  ].join(" | ");
  const longSummary = parameterLines.join("\n");
  return { shortSummary, longSummary };
}

export function incomingOfferLabel(attachment: Pick<LeadIntakeAttachmentInput, "kind" | "mimeType" | "fileName">): string {
  const name = attachment.fileName.toLocaleLowerCase();
  if (attachment.mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return "uploaded received offer (PDF)";
  }
  if (name.endsWith(".docx")) {
    return "uploaded received offer (DOCX)";
  }
  return attachment.kind === "document" ? "uploaded received offer" : `uploaded received offer (${attachment.kind})`;
}

export async function saveIncomingCommercialOfferAttachments(input: {
  crm: CrmService;
  workspaceId: string;
  leadId: string;
  attachments: LeadIntakeAttachmentInput[];
}) {
  const [leads, existingDocuments] = await Promise.all([
    input.crm.listRecords({ entity: "lead", workspaceId: input.workspaceId, includeArchived: true }),
    input.crm.listRecords({ entity: "documentFile", workspaceId: input.workspaceId, includeArchived: true })
  ]);
  const lead = leads.find((item) => item.id === input.leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }
  let version = nextCommercialOfferVersion(existingDocuments, lead.id);
  const documents = [];
  for (const attachment of input.attachments) {
    const summary = incomingCommercialOfferSummary({
      version,
      fileName: attachment.fileName,
      label: incomingOfferLabel(attachment),
      summary: attachment.summary,
      longSummary: attachment.longSummary
    });
    documents.push(
      await input.crm.upsertDocumentFile({
        workspaceId: input.workspaceId,
        leadId: lead.id,
        clientId: lead.clientId,
        fileName: attachment.fileName,
        shortSummary: summary.shortSummary,
        longSummary: summary.longSummary,
        downloadUrl: attachment.downloadUrl,
        storageProvider: attachment.storageProvider,
        storageBucket: attachment.storageBucket,
        storageKey: attachment.storageKey,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes
      })
    );
    version += 1;
  }
  return { lead, documents };
}

export function allCommercialOfferAttachments(attachments: LeadIntakeAttachmentInput[]): boolean {
  return (
    attachments.length > 0 &&
    attachments.every((attachment) =>
      looksLikeCommercialOffer({
        fileName: attachment.fileName,
        summary: attachment.summary,
        longSummary: attachment.longSummary
      })
    )
  );
}
