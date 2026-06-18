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
      return compactText(match[1], 120);
    }
  }
  return null;
}

function extractCommercialOfferParameters(source: string) {
  const compact = source.replace(/\s+/g, " ").trim();
  const gross = firstMatch(compact, [
    /(?:total gross|brutto|gesamthonorar(?:\s+brutto)?|honorar(?:\s+brutto)?)[:\s]+([0-9][0-9\s.,']*\s*(?:eur|euro|€)?)/i
  ]);
  const area = firstMatch(compact, [
    /(?:bgf|area|projektflaeche|projektfläche|wohnflaeche|wohnfläche)[:\s]+([0-9][0-9\s.,']*\s*(?:m2|m²|qm)?)/i
  ]);
  const client = firstMatch(compact, [/(?:client|kunde|auftraggeber|bauherr)[:\s]+([^.;\n]{2,120})/i]);
  const project = firstMatch(compact, [/(?:project|projekt|bauvorhaben|lead name)[:\s]+([^.;\n]{2,140})/i]);
  const clientAddress = firstMatch(compact, [
    /(?:client address|kundenadresse|anschrift|adresse(?:\s+auftraggeber)?)[:\s]+([^.;\n]{2,160})/i
  ]);
  const projectAddress = firstMatch(compact, [
    /(?:project address|projektadresse|grundstueck|grundstück|standort|ort)[:\s]+([^.;\n]{2,160})/i
  ]);
  const email = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = compact.match(/(?:\+|00)\d[\d\s()./-]{6,}\d/)?.[0] ?? null;
  const scope = firstMatch(compact, [
    /(lp\s*1\s*(?:-|to)\s*4[^.;\n]{0,120})/i,
    /(leistungsphase[n]?\s*1\s*(?:-|to)\s*4[^.;\n]{0,120})/i,
    /(architektenleistungen[^.;\n]{0,120})/i
  ]);
  const deadlines = firstMatch(compact, [/(?:deadline|due|frist|zeitplan|termine|soll)[:\s]+([^.;\n]{2,140})/i]);
  return {
    client,
    project,
    area,
    fee: gross,
    clientAddress,
    projectAddress,
    contacts: [phone, email].filter(Boolean).join(" | ") || null,
    scopeDeadlines: [scope, deadlines].filter(Boolean).join(" | ") || null
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
    `Client: ${parameters.client ?? "to review"}`,
    `Project: ${parameters.project ?? "to review"}`,
    `Area / BGF: ${parameters.area ?? "to review"}`,
    `Fee: ${parameters.fee ?? "to review"}`,
    `Client address: ${parameters.clientAddress ?? "to review"}`,
    `Project address: ${parameters.projectAddress ?? "to review"}`,
    `Contacts: ${parameters.contacts ?? "to review"}`,
    `Scope / deadlines: ${parameters.scopeDeadlines ?? "to review"}`
  ];
  const shortSummary = compactText(
    source
      ? `KP V${input.version} received; ${parameterLines.slice(1, 5).join("; ")}. ${source}`
      : `KP V${input.version} received; ${input.label} for review.`,
    420
  );
  const longSummary = [
    ...parameterLines,
    "",
    `Incoming KP: ${input.label}. This is a received/uploaded offer, not a generated draft.`,
    "This document has its own commercial-offer summary and does not update the lead summary.",
    "Review the document values and update offer fields if needed.",
    source ? `Parsed notes: ${compactText(source, 1200)}` : `File: ${input.fileName}`
  ].join("\n");
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
