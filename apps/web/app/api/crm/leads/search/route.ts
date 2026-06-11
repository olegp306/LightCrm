import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultWorkspaceId, getCrm, handleRouteError, parseJson } from "../../_shared";

const SearchInput = z.object({
  workspaceId: z.string().min(1).optional(),
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(20).optional()
});

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}+@.-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreLead(query: string, leadText: string, leadId?: string): number {
  const normalizedQuery = query.toLocaleLowerCase();
  if (leadId && leadId.toLocaleLowerCase() === normalizedQuery) {
    return 1;
  }
  const normalizedLead = leadText.toLocaleLowerCase();
  if (normalizedLead.includes(normalizedQuery)) {
    return 1;
  }
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) {
    return 0;
  }
  const matched = queryTokens.filter((token) => normalizedLead.includes(token)).length;
  return matched / queryTokens.length;
}

function latestSummariesByLeadId(
  summaries: Array<{
    leadId: string;
    shortSummary: string;
    longSummary: string | null;
    createdAt: Date;
    archivedAt: Date | null;
  }>
) {
  const latest = new Map<string, (typeof summaries)[number]>();
  for (const summary of summaries) {
    if (summary.archivedAt) {
      continue;
    }
    const existing = latest.get(summary.leadId);
    if (!existing || summary.createdAt > existing.createdAt) {
      latest.set(summary.leadId, summary);
    }
  }
  return latest;
}

const noteFields = {
  project: "Project",
  area: "Area",
  description: "Description",
  interest: "Interest",
  urgency: "Urgency",
  todo: "Todo",
  address: "Address"
} as const;

function readNoteField(notes: string | null, label: string): string | null {
  if (!notes) {
    return null;
  }
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = notes.match(new RegExp(`(?:^|\\n\\n)${escaped}: ([\\s\\S]*?)(?=\\n\\n[A-Z][A-Za-z ]+: |$)`));
  return match?.[1]?.trim() || null;
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, SearchInput);
    const workspaceId = input.workspaceId ?? defaultWorkspaceId;
    const limit = input.limit ?? 5;
    const crm = getCrm();
    const [leads, clients, summaries] = await Promise.all([
      crm.listRecords({ entity: "lead", workspaceId, includeArchived: false }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "leadSummary", workspaceId, includeArchived: true })
    ]);
    const latestSummaryByLeadId = latestSummariesByLeadId(summaries);
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const matches = leads
      .map((lead) => {
        const summary = latestSummaryByLeadId.get(lead.id);
        const client = lead.clientId ? clientsById.get(lead.clientId) ?? null : null;
        const project = readNoteField(lead.notes, noteFields.project) ?? lead.company;
        const area = readNoteField(lead.notes, noteFields.area);
        const description = readNoteField(lead.notes, noteFields.description);
        const interest = readNoteField(lead.notes, noteFields.interest);
        const urgency = readNoteField(lead.notes, noteFields.urgency);
        const todo = readNoteField(lead.notes, noteFields.todo);
        const address = readNoteField(lead.notes, noteFields.address);
        const messenger = lead.whatsapp ?? client?.whatsapp ?? null;
        const haystack = [
          lead.id,
          lead.code,
          client?.name,
          lead.name,
          project,
          area,
          description,
          lead.email,
          lead.phone,
          messenger,
          lead.status,
          interest,
          urgency,
          todo,
          address,
          summary?.shortSummary,
          summary?.longSummary,
          lead.notes
        ]
          .filter(Boolean)
          .join(" ");
        return {
          id: lead.id,
          code: lead.code,
          name: lead.name,
          status: lead.status,
          clientName: client?.name ?? lead.name,
          project,
          area,
          description,
          interest,
          urgency,
          todo,
          address,
          messenger,
          summaryShort: summary?.shortSummary ?? null,
          summaryLong: summary?.longSummary ?? null,
          summaryUpdatedAt: summary?.createdAt.toISOString() ?? null,
          score: Number(scoreLead(input.query, haystack, lead.id).toFixed(3)),
          updatedAt: lead.updatedAt.toISOString()
        };
      })
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);

    return NextResponse.json({ matches });
  } catch (error) {
    return handleRouteError(error);
  }
}
