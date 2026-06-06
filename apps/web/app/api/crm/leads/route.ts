import { NextResponse } from "next/server";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../_shared";

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const crm = getCrm();
    const [leads, clients] = await Promise.all([
      crm.listRecords({ entity: "lead", workspaceId, includeArchived }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true })
    ]);
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    return NextResponse.json(
      leads.map((lead) => {
        const client = lead.clientId ? clientsById.get(lead.clientId) ?? null : null;
        return {
          ...lead,
          client,
          project: readNoteField(lead.notes, noteFields.project) ?? lead.company,
          area: readNoteField(lead.notes, noteFields.area),
          description: readNoteField(lead.notes, noteFields.description) ?? lead.notes,
          interest: readNoteField(lead.notes, noteFields.interest),
          urgency: readNoteField(lead.notes, noteFields.urgency),
          todo: readNoteField(lead.notes, noteFields.todo),
          address: readNoteField(lead.notes, noteFields.address),
          messenger: lead.whatsapp ?? client?.whatsapp ?? null,
          clientProjects: readNoteField(lead.notes, noteFields.clientProjects),
          budgetEur: readNoteField(lead.notes, noteFields.budgetEur),
          rawInput: readNoteField(lead.notes, noteFields.rawInput)
        };
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
