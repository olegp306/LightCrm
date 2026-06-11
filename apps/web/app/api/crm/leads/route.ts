import { NextResponse } from "next/server";
import { evaluateCommercialOfferReadiness } from "@lightcrm/core";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../_shared";
import { getCrmRuntimeSettings } from "../settings/crm-settings-store";

const noteFields = {
  project: "Project",
  area: "Area",
  description: "Description",
  interest: "Interest",
  urgency: "Urgency",
  todo: "Todo",
  address: "Address",
  clientProjects: "Client projects",
  budgetEur: "Budget EUR",
  rawInput: "Raw input"
} as const;

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

function projectTypeFromLead(project: string | null, description: string | null): string | null {
  const combined = [project, description].filter(Boolean).join(" ");
  if (!combined) {
    return null;
  }
  const normalized = combined.toLocaleLowerCase();
  if (["efh", "einfamilienhaus", "private house", "haus"].some((token) => normalized.includes(token))) {
    return "EFH Neubau";
  }
  return combined.slice(0, 80);
}

function compactSummary(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function readLatestLeadSummary(notes: string | null): { summaryShort: string | null; summaryLong: string | null } {
  if (!notes) {
    return { summaryShort: null, summaryLong: null };
  }
  const blocks = [...notes.matchAll(/Lead intake summary\n([\s\S]*?)(?=\n\nLead intake summary\n|$)/g)];
  const latest = blocks.at(-1)?.[1]?.trim();
  if (!latest) {
    return { summaryShort: null, summaryLong: null };
  }
  const [summary] = latest.split(/\n\nOriginal takes\n/);
  const cleanSummary = summary.trim();
  return {
    summaryShort: compactSummary(cleanSummary, 180),
    summaryLong: compactSummary(cleanSummary, 700)
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const crm = getCrm();
    const [leads, clients, documents, summaries] = await Promise.all([
      crm.listRecords({ entity: "lead", workspaceId, includeArchived }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "documentFile", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "leadSummary", workspaceId, includeArchived: true })
    ]);
    const crmSettings = await getCrmRuntimeSettings();
    const feeRows = crmSettings.commercialOffers.activeFeeTable?.rows ?? [];
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const documentsByLeadId = new Map<string, typeof documents>();
    for (const document of documents) {
      if (!document.leadId || document.archivedAt) {
        continue;
      }
      const leadDocuments = documentsByLeadId.get(document.leadId) ?? [];
      leadDocuments.push(document);
      documentsByLeadId.set(document.leadId, leadDocuments);
    }
    const latestSummaryByLeadId = new Map<string, (typeof summaries)[number]>();
    for (const summary of summaries) {
      if (summary.archivedAt) {
        continue;
      }
      const existing = latestSummaryByLeadId.get(summary.leadId);
      if (!existing || summary.createdAt > existing.createdAt) {
        latestSummaryByLeadId.set(summary.leadId, summary);
      }
    }
    return NextResponse.json(
      leads.map((lead) => {
        const client = lead.clientId ? clientsById.get(lead.clientId) ?? null : null;
        const project = readNoteField(lead.notes, noteFields.project) ?? lead.company;
        const area = readNoteField(lead.notes, noteFields.area);
        const description = readNoteField(lead.notes, noteFields.description) ?? lead.notes;
        const address = readNoteField(lead.notes, noteFields.address);
        const storedSummary = latestSummaryByLeadId.get(lead.id);
        const notesSummary = readLatestLeadSummary(lead.notes);
        const offerReadiness = evaluateCommercialOfferReadiness(
          {
            clientName: client?.name ?? null,
            projectName: project,
            projectAddress: address,
            projectType: projectTypeFromLead(project, description),
            bgf: readNumber(area)
          },
          feeRows
        );
        return {
          ...lead,
          client,
          documents: documentsByLeadId.get(lead.id) ?? [],
          project,
          area,
          summaryShort: storedSummary?.shortSummary ?? notesSummary.summaryShort,
          summaryLong: storedSummary?.longSummary ?? notesSummary.summaryLong,
          summaryUpdatedAt: storedSummary?.createdAt ?? lead.updatedAt,
          description,
          interest: readNoteField(lead.notes, noteFields.interest),
          urgency: readNoteField(lead.notes, noteFields.urgency),
          todo: readNoteField(lead.notes, noteFields.todo),
          address,
          messenger: lead.whatsapp ?? client?.whatsapp ?? null,
          clientProjects: readNoteField(lead.notes, noteFields.clientProjects),
          budgetEur: readNoteField(lead.notes, noteFields.budgetEur),
          rawInput: readNoteField(lead.notes, noteFields.rawInput),
          offerStatus: offerReadiness.status,
          offerMissingFields: offerReadiness.missingFields.join(", "),
          offerTotalGross: offerReadiness.values.totalGross,
          offerReadiness
        };
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
