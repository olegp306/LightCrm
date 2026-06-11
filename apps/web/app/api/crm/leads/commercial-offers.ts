import { evaluateCommercialOfferReadiness } from "@lightcrm/core";
import { storeCrmFile } from "@lightcrm/storage";
import { randomUUID } from "node:crypto";
import type { createCrmService } from "@lightcrm/core";
import {
  getCrmRuntimeSettings,
  readActiveOfferTemplate,
  renderDocxTemplate
} from "../settings/crm-settings-store";

type CrmService = ReturnType<typeof createCrmService>;

const noteFields = {
  project: "Project",
  area: "Area",
  description: "Description",
  address: "Address"
} as const;

export type CommercialOfferGenerationResult = {
  document: Awaited<ReturnType<CrmService["upsertDocumentFile"]>>;
  readiness: ReturnType<typeof evaluateCommercialOfferReadiness>;
};

export type CommercialOfferAutoResult =
  | { status: "generated"; result: CommercialOfferGenerationResult }
  | { status: "skipped"; reason: string };

function readNoteField(notes: string | null, label: string): string | null {
  if (!notes) {
    return null;
  }
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = notes.match(new RegExp(`(?:^|\\n\\n)${escaped}: ([\\s\\S]*?)(?=\\n\\n[A-Z][A-Za-z ]+: |$)`));
  return match?.[1]?.trim() || null;
}

function readNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatCurrency(value: number | null): string | null {
  return value === null ? null : value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function projectTypeFromLead(project: string | null, description: string | null): string | null {
  const combined = [project, description].filter(Boolean).join(" ");
  if (!combined) {
    return null;
  }
  const normalized = combined.toLocaleLowerCase();
  if (["efh", "einfamilienhaus", "private house", "haus"].some((token) => normalized.includes(token))) {
    return "EFH Neubau";
  }
  return null;
}

export async function generateCommercialOfferForLead(input: {
  crm: CrmService;
  workspaceId: string;
  leadId: string;
}): Promise<CommercialOfferGenerationResult> {
  const [leads, clients] = await Promise.all([
    input.crm.listRecords({ entity: "lead", workspaceId: input.workspaceId, includeArchived: true }),
    input.crm.listRecords({ entity: "client", workspaceId: input.workspaceId, includeArchived: true })
  ]);
  const lead = leads.find((item) => item.id === input.leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }
  const client = lead.clientId ? clients.find((item) => item.id === lead.clientId) ?? null : null;
  const settings = await getCrmRuntimeSettings();
  if (!settings.commercialOffers.activeTemplate) {
    throw new Error("Commercial offer template is not uploaded");
  }

  const project = readNoteField(lead.notes, noteFields.project) ?? lead.company ?? lead.name;
  const area = readNoteField(lead.notes, noteFields.area);
  const description = readNoteField(lead.notes, noteFields.description) ?? lead.notes;
  const address = readNoteField(lead.notes, noteFields.address);
  const readiness = evaluateCommercialOfferReadiness(
    {
      clientName: client?.name ?? null,
      projectName: project,
      projectAddress: address,
      projectType: projectTypeFromLead(project, description),
      bgf: readNumber(area)
    },
    settings.commercialOffers.activeFeeTable?.rows ?? []
  );

  if (readiness.values.totalGross === null) {
    const error = new Error("Commercial offer numbers are not ready");
    (error as Error & { readiness?: typeof readiness }).readiness = readiness;
    throw error;
  }

  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + settings.commercialOffers.offerValidityDays);
  const values = {
    date: formatDate(now),
    client_name: client?.name ?? null,
    client_address_line_1: null,
    client_address_line_2: null,
    project_name: project,
    project_address: address,
    bgf: readiness.values.bgf,
    wohnflaeche: readiness.values.wohnflaeche,
    project_type: projectTypeFromLead(project, description) ?? null,
    lp1_3_net: formatCurrency(readiness.values.lp1_3Net),
    lp4_net: formatCurrency(readiness.values.lp4Net),
    total_net: formatCurrency(readiness.values.totalNet),
    mwst: formatCurrency(readiness.values.mwst),
    total_gross: formatCurrency(readiness.values.totalGross),
    ms1_net: formatCurrency(readiness.values.ms1Net),
    ms2_net: formatCurrency(readiness.values.ms2Net),
    ms3_net: formatCurrency(readiness.values.ms3Net),
    offer_valid_until: formatDate(validUntil)
  };

  const template = await readActiveOfferTemplate();
  const rendered = renderDocxTemplate(template, values);
  const fileName = `${lead.code ?? lead.id}-commercial-offer.docx`;
  const stored = await storeCrmFile({
    bytes: new Uint8Array(rendered),
    fileName,
    workspaceId: input.workspaceId,
    leadId: lead.id,
    clientId: lead.clientId,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    storageKeySuffix: `commercial-offer-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  });
  const document = await input.crm.upsertDocumentFile({
    workspaceId: input.workspaceId,
    leadId: lead.id,
    clientId: lead.clientId,
    fileName: stored.fileName,
    shortSummary: `Commercial offer ${formatCurrency(readiness.values.totalGross)} EUR gross`,
    longSummary: `Generated commercial offer from active DOCX template. Missing fields: ${
      readiness.missingFields.join(", ") || "none"
    }.`,
    downloadUrl: stored.downloadUrl,
    storageProvider: stored.storageProvider,
    storageBucket: stored.storageBucket,
    storageKey: stored.storageKey,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes
  });

  return { document, readiness };
}

export async function maybeAutoGenerateCommercialOfferForLead(input: {
  crm: CrmService;
  workspaceId: string;
  leadId: string;
}): Promise<CommercialOfferAutoResult> {
  const settings = await getCrmRuntimeSettings();
  if (!settings.commercialOffers.autoGenerateWhenReady) {
    return { status: "skipped", reason: "auto generation is disabled" };
  }
  if (!settings.commercialOffers.activeTemplate) {
    return { status: "skipped", reason: "commercial offer template is not uploaded" };
  }
  const documents = await input.crm.listRecords({
    entity: "documentFile",
    workspaceId: input.workspaceId,
    includeArchived: true
  });
  const alreadyGenerated = documents.some(
    (document) =>
      document.leadId === input.leadId &&
      !document.archivedAt &&
      document.shortSummary.toLocaleLowerCase().startsWith("commercial offer ")
  );
  if (alreadyGenerated) {
    return { status: "skipped", reason: "commercial offer already exists" };
  }
  try {
    const result = await generateCommercialOfferForLead(input);
    return { status: "generated", result };
  } catch (error) {
    return {
      status: "skipped",
      reason: error instanceof Error ? error.message : "commercial offer generation failed"
    };
  }
}
