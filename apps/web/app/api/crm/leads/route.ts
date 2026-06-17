import { NextResponse } from "next/server";
import { evaluateCommercialOfferReadiness } from "@lightcrm/core";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../_shared";
import { getCrmRuntimeSettings } from "../settings/crm-settings-store";
import { leadNoteFields, readJsonNoteField, readNoteField } from "./note-fields";

const leadSummaryShortMax = 260;
const leadSummaryLongMax = 900;

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

function projectNameFrom(project: string | null, leadName: string): string {
  const source = project || leadName;
  return compactSummary(source, 54);
}

function displaySourceChannel(value: string | null): string | null {
  return value?.toLocaleLowerCase() === "telegram" ? "TG" : value;
}

function nextActionFrom(input: {
  todo: string | null;
  offerStatus: string;
  status: string;
}): { nextAction: string; nextActionState: "crm" | "waiting" | "done" | "neutral" } {
  if (input.todo) {
    return { nextAction: compactSummary(input.todo, 26), nextActionState: "crm" };
  }
  if (["converted", "archived", "lost"].includes(input.status)) {
    return { nextAction: "Done", nextActionState: "done" };
  }
  if (input.offerStatus === "ready") {
    return { nextAction: "Create offer", nextActionState: "crm" };
  }
  if (input.offerStatus === "needs_data" || input.offerStatus === "not_ready") {
    return { nextAction: "Needs data", nextActionState: "waiting" };
  }
  return { nextAction: "Monitor", nextActionState: "neutral" };
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
    summaryShort: compactSummary(cleanSummary, leadSummaryShortMax),
    summaryLong: compactSummary(cleanSummary, leadSummaryLongMax)
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
        const project = readNoteField(lead.notes, leadNoteFields.project) ?? lead.company;
        const area = readNoteField(lead.notes, leadNoteFields.area);
        const description = readNoteField(lead.notes, leadNoteFields.description);
        const address = readNoteField(lead.notes, leadNoteFields.address);
        const todo = readNoteField(lead.notes, leadNoteFields.todo);
        const ballSide = readNoteField(lead.notes, leadNoteFields.ballSide) ?? "us";
        const budgetEur = readNoteField(lead.notes, leadNoteFields.budgetEur);
        const offerFields = readJsonNoteField<Record<string, string>>(lead.notes, leadNoteFields.offerFields) ?? {};
        const storedSummary = latestSummaryByLeadId.get(lead.id);
        const notesSummary = readLatestLeadSummary(lead.notes);
        const offerReadiness = evaluateCommercialOfferReadiness(
          {
            clientName: client?.name ?? null,
            projectName: project,
            projectAddress: address,
            projectType: projectTypeFromLead(project, description),
            bgf: readNumber(area),
            manualTotalGross: readNumber(budgetEur)
          },
          feeRows
        );
        const nextAction = nextActionFrom({ todo, offerStatus: offerReadiness.status, status: lead.status });
        return {
          ...lead,
          sourceChannel: displaySourceChannel(lead.sourceChannel),
          client,
          documents: documentsByLeadId.get(lead.id) ?? [],
          projectName: projectNameFrom(project, lead.name),
          project,
          area,
          summaryShort: storedSummary?.shortSummary ?? notesSummary.summaryShort,
          summaryLong: storedSummary?.longSummary ?? notesSummary.summaryLong,
          summaryUpdatedAt: storedSummary?.createdAt ?? lead.updatedAt,
          description,
          interest: readNoteField(lead.notes, leadNoteFields.interest),
          urgency: readNoteField(lead.notes, leadNoteFields.urgency),
          todo,
          ballSide,
          nextAction: nextAction.nextAction,
          nextActionState: nextAction.nextActionState,
          address,
          messenger: lead.whatsapp ?? client?.whatsapp ?? null,
          clientProjects: readNoteField(lead.notes, leadNoteFields.clientProjects),
          budgetEur,
          offerFields,
          rawInput: readNoteField(lead.notes, leadNoteFields.rawInput),
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
