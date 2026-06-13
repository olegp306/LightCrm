import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, parseJson, resolveWorkspaceId } from "../../_shared";
import { leadNoteFields, readNoteField } from "../note-fields";

const RegenerateLeadSummaryInput = z.object({
  workspaceId: z.string().min(1).optional(),
  leadId: z.string().min(1)
});

const leadSummaryShortMax = 120;
const leadSummaryLongMax = 420;

function compactText(value: string | null | undefined, maxLength: number): string {
  const compacted = (value ?? "").replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function sentence(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

function formatArea(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const raw = value.trim();
  const numeric = Number(raw.replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return raw.includes("m²") || raw.includes("м²") ? raw : `${raw} m²`;
  }
  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 1
  }).format(numeric)} m²`;
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, RegenerateLeadSummaryInput);
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const crm = getCrm();
    const [leads, clients, documents, summaries] = await Promise.all([
      crm.listRecords({ entity: "lead", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "documentFile", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "leadSummary", workspaceId, includeArchived: true })
    ]);
    const lead = leads.find((item) => item.id === input.leadId && !item.archivedAt);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const client = lead.clientId ? clients.find((item) => item.id === lead.clientId) ?? null : null;
    const project = readNoteField(lead.notes, leadNoteFields.project) ?? lead.company ?? lead.name;
    const area = readNoteField(lead.notes, leadNoteFields.area);
    const formattedArea = formatArea(area);
    const description = readNoteField(lead.notes, leadNoteFields.description);
    const interest = readNoteField(lead.notes, leadNoteFields.interest);
    const urgency = readNoteField(lead.notes, leadNoteFields.urgency);
    const todo = readNoteField(lead.notes, leadNoteFields.todo);
    const leadDocuments = documents.filter((document) => document.leadId === lead.id && !document.archivedAt);
    const documentSummary = leadDocuments.length
      ? `${leadDocuments.length} document(s): ${leadDocuments.map((document) => compactText(document.shortSummary || document.fileName, 70)).join("; ")}`
      : "No attached documents.";

    const shortSummary = compactText(
      sentence([
        client?.name ? `Client: ${client.name}` : "Client not linked yet",
        project ? `Project: ${project}` : null,
        formattedArea ? `Area: ${formattedArea}` : null,
        todo ? `Next: ${todo}` : null
      ]),
      leadSummaryShortMax
    );
    const longSummary = compactText(
      [
        sentence([
          client?.name ? `Client: ${client.name}` : "Client is not linked yet",
          project ? `Project: ${project}` : null,
          formattedArea ? `Area: ${formattedArea}` : null,
          interest ? `Interest: ${interest}` : null,
          urgency ? `Urgency: ${urgency}` : null,
          todo ? `Next action: ${todo}` : null
        ]),
        description ? `Description: ${description}` : null,
        documentSummary,
        "Generated from current CRM fields and imported source data; original import was not rewritten."
      ]
        .filter(Boolean)
        .join("\n\n"),
      leadSummaryLongMax
    );

    const existingRegenerated = summaries
      .filter((summary) => summary.leadId === lead.id && !summary.archivedAt && summary.source === "web-regenerate")
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .find((summary) => summary.shortSummary === shortSummary && (summary.longSummary ?? null) === longSummary);

    if (existingRegenerated) {
      return NextResponse.json({ summary: existingRegenerated, reused: true });
    }

    const summary = await crm.createLeadSummary({
      workspaceId,
      leadId: lead.id,
      shortSummary,
      longSummary,
      source: "web-regenerate"
    });

    return NextResponse.json({ summary, reused: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
