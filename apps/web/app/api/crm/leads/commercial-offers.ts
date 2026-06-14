import { evaluateCommercialOfferReadiness } from "@lightcrm/core";
import { storeCrmFile } from "@lightcrm/storage";
import { randomUUID } from "node:crypto";
import type { Client, createCrmService, DocumentFile, Lead } from "@lightcrm/core";
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
  address: "Address",
  budgetEur: "Budget EUR"
} as const;

export type CommercialOfferGenerationResult = {
  document: Awaited<ReturnType<CrmService["upsertDocumentFile"]>>;
  readiness: ReturnType<typeof evaluateCommercialOfferReadiness>;
  offerVersion: number;
};

export type CommercialOfferReadinessResult = {
  lead: Lead;
  client: Client | null;
  settings: Awaited<ReturnType<typeof getCrmRuntimeSettings>>;
  project: string;
  description: string | null;
  address: string | null;
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
  const match = value.match(/\d[\d\s.,]*/);
  if (!match) {
    return null;
  }
  const raw = match[0].replace(/\s+/g, "");
  const normalized =
    raw.includes(".") && raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.includes(".") && /^\d{1,3}(?:\.\d{3})+$/.test(raw)
        ? raw.replace(/\./g, "")
        : raw.replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrency(value: number | null): string | null {
  return value === null ? null : value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function humanOfferFieldName(value: string): string {
  const labels: Record<string, string> = {
    bgf: "BGF / area",
    bgf_or_manual_total_gross: "BGF / area or manual gross price",
    project_type_or_manual_total_gross: "project type or manual gross price",
    manual_total_gross: "manual gross price",
    project_name: "project name",
    project_address: "project address",
    client_name: "client name"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function readinessFieldSummary(readiness: ReturnType<typeof evaluateCommercialOfferReadiness>, version: number, createdAt: Date): string {
  const requiredForPrice =
    readiness.priceMissingFields.length > 0
      ? `missing: ${readiness.priceMissingFields.map(humanOfferFieldName).join(", ")}`
      : `ready: ${formatCurrency(readiness.values.totalGross)} EUR gross (${readiness.pricingMode})`;
  const documentFields =
    readiness.documentMissingFields.length > 0
      ? `missing: ${readiness.documentMissingFields.map(humanOfferFieldName).join(", ")}`
      : "ready";
  const summary =
    readiness.values.totalGross === null
      ? "Commercial offer cannot be generated until price-critical fields are filled."
      : `Commercial offer v${version} generated on ${formatDate(createdAt)}. Use this summary to compare what was promised to the client in this version.`;
  return [
    `Version: v${version}.`,
    `Price fields: ${requiredForPrice}.`,
    `Document fields: ${documentFields}.`,
    `Summary: ${summary}`
  ].join("\n");
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

function nextCommercialOfferVersion(documents: DocumentFile[], leadId: string): number {
  const activeLeadOffers = documents.filter(
    (document) =>
      document.leadId === leadId &&
      document.archivedAt === null &&
      document.shortSummary.toLocaleLowerCase().startsWith("commercial offer")
  );
  return activeLeadOffers.length + 1;
}

export async function evaluateCommercialOfferForLead(input: {
  crm: CrmService;
  workspaceId: string;
  leadId: string;
}): Promise<CommercialOfferReadinessResult> {
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
  const project = readNoteField(lead.notes, noteFields.project) ?? lead.company ?? lead.name;
  const area = readNoteField(lead.notes, noteFields.area);
  const description = readNoteField(lead.notes, noteFields.description) ?? lead.notes;
  const address = readNoteField(lead.notes, noteFields.address);
  const manualTotalGross = readNumber(readNoteField(lead.notes, noteFields.budgetEur));
  const readiness = evaluateCommercialOfferReadiness(
    {
      clientName: client?.name ?? null,
      projectName: project,
      projectAddress: address,
      projectType: projectTypeFromLead(project, description),
      bgf: readNumber(area),
      manualTotalGross
    },
    settings.commercialOffers.activeFeeTable?.rows ?? []
  );
  return { lead, client, settings, project, description, address, readiness };
}

export async function generateCommercialOfferForLead(input: {
  crm: CrmService;
  workspaceId: string;
  leadId: string;
}): Promise<CommercialOfferGenerationResult> {
  const { lead, client, settings, project, description, address, readiness } = await evaluateCommercialOfferForLead(input);

  if (readiness.values.totalGross === null) {
    const details = [
      ...readiness.reasons,
      readiness.priceMissingFields.length > 0
        ? `Missing price fields: ${readiness.priceMissingFields.map(humanOfferFieldName).join(", ")}.`
        : null,
      readiness.documentMissingFields.length > 0
        ? `Missing document fields: ${readiness.documentMissingFields.map(humanOfferFieldName).join(", ")}.`
        : null,
      settings.commercialOffers.activeFeeTable?.rows.length
        ? null
        : "Active fee table has no rows for automatic pricing."
    ].filter(Boolean);
    const error = new Error(
      details.length > 0
        ? `Commercial offer numbers are not ready. ${details.join(" ")}`
        : "Commercial offer numbers are not ready. Check BGF, project type, client, address, and active fee table."
    );
    (error as Error & { readiness?: typeof readiness }).readiness = readiness;
    throw error;
  }

  if (!settings.commercialOffers.activeTemplate) {
    throw new Error("Commercial offer template is not uploaded");
  }

  const now = new Date();
  const existingDocuments = await input.crm.listRecords({
    entity: "documentFile",
    workspaceId: input.workspaceId,
    includeArchived: true
  });
  const offerVersion = nextCommercialOfferVersion(existingDocuments, lead.id);
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
    pricing_mode: readiness.pricingMode,
    offer_valid_until: formatDate(validUntil)
  };

  const template = await readActiveOfferTemplate();
  const rendered = renderDocxTemplate(template, values);
  const fileName = `${lead.code ?? lead.id}-commercial-offer-v${offerVersion}.docx`;
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
    shortSummary: `Commercial offer v${offerVersion} ${formatCurrency(readiness.values.totalGross)} EUR gross (${readiness.pricingMode})`,
    longSummary: readinessFieldSummary(readiness, offerVersion, now),
    downloadUrl: stored.downloadUrl,
    storageProvider: stored.storageProvider,
    storageBucket: stored.storageBucket,
    storageKey: stored.storageKey,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes
  });

  return { document, readiness, offerVersion };
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
