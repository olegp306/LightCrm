import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, resolveWorkspaceId } from "../../_shared";

const ClientPatch = z
  .object({
    name: optionalText,
    email: optionalText,
    phone: optionalText,
    whatsapp: optionalText,
    company: optionalText,
    status: z.enum(["active", "warm", "paused", "archived"]).optional(),
    notes: optionalText,
    sourceChannel: optionalText
  })
  .strict();

const UpdateInput = z.object({
  workspaceId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  patch: ClientPatch,
  source: z
    .object({
      channel: optionalText,
      messageId: optionalText
    })
    .optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, UpdateInput);
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const crm = getCrm();
    const clients = await crm.listRecords({ entity: "client", workspaceId, includeArchived: true });
    const existing = clients.find((client) => client.id === input.clientId);
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const client = await crm.upsertClient({
      ...existing,
      ...input.patch,
      id: existing.id,
      workspaceId,
      code: existing.code,
      name: input.patch.name ?? existing.name
    });
    return NextResponse.json({ client });
  } catch (error) {
    return handleRouteError(error);
  }
}
