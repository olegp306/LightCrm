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
  budgetEur: "Budget EUR",
  offerFields: "Offer fields"
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

function readOfferFields(notes: string | null): Record<string, string> {
  const raw = readNoteField(notes, noteFields.offerFields);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""] as const)
        .filter(([, value]) => value)
    );
  } catch {
    return {};
  }
}

function formatCurrency(value: number | null): string | null {
  return value === null ? null : value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

function formatCurrencyText(value: number | null): string {
  const formatted = formatCurrency(value);
  return formatted === null ? "n/a" : `${formatted} EUR`;
}

function formatAreaText(value: number | null): string {
  return value === null ? "n/a" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} m\u00B2`;
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
    project_name: "lead name",
    project_address: "project address",
    client_name: "client name"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function readinessFieldSummary(readiness: ReturnType<typeof evaluateCommercialOfferReadiness>, version: number, createdAt: Date): string {
  const requiredForPrice =
    readiness.priceMissingFields.length > 0
      ? `missing: ${readiness.priceMissingFields.map(humanOfferFieldName).join(", ")}`
      : `ready: ${formatCurrencyText(readiness.values.totalGross)} gross (${readiness.pricingMode})`;
  const documentFields =
    readiness.documentMissingFields.length > 0
      ? `missing: ${readiness.documentMissingFields.map(humanOfferFieldName).join(", ")}`
      : "ready";
  const summary =
    readiness.values.totalGross === null
      ? "Commercial offer cannot be generated until price-critical fields are filled."
      : `KP V${version}d draft generated on ${formatDate(createdAt)}. Use this summary to compare what was promised to the client in this draft version.`;
  const valueLines = [
    `Pricing mode: ${readiness.pricingMode}.`,
    `BGF: ${formatAreaText(readiness.values.bgf)}.`,
    `Wohnflaeche: ${formatAreaText(readiness.values.wohnflaeche)}.`,
    `LP 1-3 net: ${formatCurrencyText(readiness.values.lp1_3Net)}.`,
    `LP 4 net: ${formatCurrencyText(readiness.values.lp4Net)}.`,
    `Total net: ${formatCurrencyText(readiness.values.totalNet)}.`,
    `VAT 19%: ${formatCurrencyText(readiness.values.mwst)}.`,
    `Total gross: ${formatCurrencyText(readiness.values.totalGross)}.`,
    `Payment plan net: 30% ${formatCurrencyText(readiness.values.ms1Net)}, 40% ${formatCurrencyText(readiness.values.ms2Net)}, 30% ${formatCurrencyText(readiness.values.ms3Net)}.`
  ];
  return [
    `Version: KP V${version}d draft.`,
    `Price fields: ${requiredForPrice}.`,
    `Document fields: ${documentFields}.`,
    "Offer values:",
    ...valueLines,
    `Summary: ${summary}`
  ].join("\n");
}

function generatedOfferShortSummary(readiness: ReturnType<typeof evaluateCommercialOfferReadiness>, version: number): string {
  const parts = [
    `KP V${version}d draft`,
    `gross ${formatCurrencyText(readiness.values.totalGross)}`,
    `BGF ${formatAreaText(readiness.values.bgf)}`,
    `Wohnflaeche ${formatAreaText(readiness.values.wohnflaeche)}`,
    readiness.pricingMode
  ];
  return parts.join(" | ");
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
  const versions = documents
    .filter((document) => document.leadId === leadId && document.archivedAt === null)
    .map((document) => [document.shortSummary, document.fileName].join(" ").match(/\b(?:kp|commercial offer)\s*V(\d+)/i))
    .map((match) => (match ? Number(match[1]) : null))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return versions.length > 0 ? Math.max(...versions) + 1 : 1;
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
  const offerFields = readOfferFields(lead.notes);
  const project = readNoteField(lead.notes, noteFields.project) ?? lead.company ?? lead.name;
  const area = readNoteField(lead.notes, noteFields.area);
  const description = readNoteField(lead.notes, noteFields.description) ?? lead.notes;
  const address = readNoteField(lead.notes, noteFields.address);
  const manualTotalGross = readNumber(readNoteField(lead.notes, noteFields.budgetEur));
  const readiness = evaluateCommercialOfferReadiness(
    {
      clientName: offerFields.client_name ?? client?.name ?? null,
      projectName: offerFields.project_name ?? project,
      projectAddress: offerFields.project_address ?? address,
      projectType: offerFields.project_type ?? projectTypeFromLead(project, description),
      bgf: readNumber(area),
      manualTotalGross: readNumber(offerFields.manual_total_gross ?? null) ?? manualTotalGross
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
  const offerFields = readOfferFields(lead.notes);
  const values = {
    ...offerFields,
    date: formatDate(now),
    client_name: offerFields.client_name ?? client?.name ?? null,
    client_address_line_1: offerFields.client_address_line_1 ?? null,
    client_address_line_2: offerFields.client_address_line_2 ?? null,
    project_name: offerFields.project_name ?? project ?? null,
    project_address: offerFields.project_address ?? address ?? null,
    bgf: readiness.values.bgf,
    wohnflaeche: readiness.values.wohnflaeche,
    project_type: offerFields.project_type ?? projectTypeFromLead(project, description) ?? null,
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
  const fileName = `${lead.code ?? lead.id}-commercial-offer-V${offerVersion}d.docx`;
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
    shortSummary: generatedOfferShortSummary(readiness, offerVersion),
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
      /^(?:kp|commercial offer)\s+v\d+d?\s+draft/i.test(document.shortSummary)
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
