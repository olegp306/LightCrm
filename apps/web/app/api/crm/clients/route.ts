import { getPrismaClient } from "@lightcrm/db";
import { latestOutreachAt } from "../_shared/outreach-columns";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../_shared";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const clients = await getCrm().listRecords({ entity: "client", workspaceId, includeArchived });
    const touches = await getPrismaClient().outreachTouch.findMany({
      where: { workspaceId, clientId: { in: clients.map((client) => client.id) } },
      orderBy: { occurredAt: "asc" }
    });
    const touchesByClientId = new Map<string, typeof touches>();
    for (const touch of touches) {
      if (!touch.clientId) {
        continue;
      }
      touchesByClientId.set(touch.clientId, [...(touchesByClientId.get(touch.clientId) ?? []), touch]);
    }
    return NextResponse.json(
      clients.map((client) => ({
        ...client,
        pingAt: latestOutreachAt(touchesByClientId.get(client.id) ?? [], null)
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
