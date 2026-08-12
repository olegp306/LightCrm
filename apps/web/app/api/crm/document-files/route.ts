import { NextResponse } from "next/server";
import { getCrm, handleRouteError, resolveWorkspaceId } from "../_shared";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = resolveWorkspaceId(url.searchParams.get("workspaceId"));
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const crm = getCrm();
    const [files, clients, leads] = await Promise.all([
      crm.listRecords({ entity: "documentFile", workspaceId, includeArchived }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "lead", workspaceId, includeArchived: true })
    ]);
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const leadsById = new Map(leads.map((lead) => [lead.id, lead]));

    return NextResponse.json(
      files.map((file) => {
        const lead = file.leadId ? leadsById.get(file.leadId) ?? null : null;
        const client = file.clientId ? clientsById.get(file.clientId) ?? null : lead?.clientId ? clientsById.get(lead.clientId) ?? null : null;
        const relatedLabel = lead?.name ?? client?.name ?? "Unlinked";
        const relatedHref = lead ? `/leads?record=${lead.id}` : client ? `/clients?record=${client.id}` : null;
        return {
          ...file,
          lead,
          client,
          relatedLabel,
          relatedHref
        };
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
