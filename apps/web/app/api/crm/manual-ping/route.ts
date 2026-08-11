import { getPrismaClient } from "@lightcrm/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authSessionCookieName,
  accountDisplayName,
  accountShortCode,
  readSessionCookieValue
} from "../../../../auth/session";
import { dateString, handleRouteError, parseJson, resolveWorkspaceId } from "../_shared";

const manualPingChannels = ["email", "linkedin", "phone", "telegram", "whatsapp"] as const;
export type ManualPingEntity = "lead" | "coldTarget" | "client";

const entitySchema = z.enum(["lead", "coldTarget", "client"]);
const channelSchema = z.enum(manualPingChannels);
const postSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  entity: entitySchema,
  recordId: z.string().min(1),
  channel: channelSchema,
  occurredAt: dateString.optional()
});
const querySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  entity: entitySchema,
  recordId: z.string().min(1)
});

function entityForeignKey(entity: ManualPingEntity) {
  return entity === "lead" ? "leadId" : entity === "coldTarget" ? "coldTargetId" : "clientId";
}

function protocolEntry(touch: {
  id: string;
  channel: string;
  occurredAt: Date;
  outcome: string | null;
  actorEmail: string | null;
}) {
  return {
    id: touch.id,
    channel: touch.channel,
    subject: null,
    direction: "outbound",
    occurredAt: touch.occurredAt.toISOString(),
    outcome: touch.outcome,
    actor: accountDisplayName(touch.actorEmail),
    actorCode: accountShortCode(touch.actorEmail),
    authorName: accountDisplayName(touch.actorEmail),
    authorCode: accountShortCode(touch.actorEmail),
    authorEmail: touch.actorEmail,
    actorEmail: touch.actorEmail
  };
}

async function entityExists(entity: ManualPingEntity, workspaceId: string, recordId: string) {
  const prisma = getPrismaClient();
  const where = { id: recordId, workspaceId, archivedAt: null };
  if (entity === "lead") {
    return Boolean(await prisma.lead.findFirst({ where, select: { id: true } }));
  }
  if (entity === "coldTarget") {
    return Boolean(await prisma.coldTarget.findFirst({ where, select: { id: true } }));
  }
  return Boolean(await prisma.client.findFirst({ where, select: { id: true } }));
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, postSchema);
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    if (!(await entityExists(input.entity, workspaceId, input.recordId))) {
      return NextResponse.json({ error: `${input.entity} not found` }, { status: 404 });
    }
    const session = await readSessionCookieValue(cookies().get(authSessionCookieName)?.value);
    const occurredAt = input.occurredAt ?? new Date();
    const touch = await getPrismaClient().outreachTouch.create({
      data: {
        workspaceId,
        leadId: input.entity === "lead" ? input.recordId : null,
        coldTargetId: input.entity === "coldTarget" ? input.recordId : null,
        clientId: input.entity === "client" ? input.recordId : null,
        channel: input.channel,
        direction: "outbound",
        subject: null,
        body: null,
        occurredAt,
        outcome: "manual_ping",
        actorEmail: session?.email ?? null
      }
    });
    return NextResponse.json({
      touch,
      pingAt: touch.occurredAt.toISOString(),
      protocolEntry: protocolEntry(touch)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({
      workspaceId: url.searchParams.get("workspaceId") ?? undefined,
      entity: url.searchParams.get("entity"),
      recordId: url.searchParams.get("recordId")
    });
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const touches = await getPrismaClient().outreachTouch.findMany({
      where: { workspaceId, [entityForeignKey(input.entity)]: input.recordId },
      orderBy: { occurredAt: "desc" }
    });
    return NextResponse.json(touches.map(protocolEntry));
  } catch (error) {
    return handleRouteError(error);
  }
}
