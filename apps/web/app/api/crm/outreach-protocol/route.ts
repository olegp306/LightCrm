import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountDisplayName, accountShortCode } from "../../../../auth/session";
import { handleRouteError, resolveWorkspaceId } from "../_shared";

const querySchema = z.object({
  workspaceId: z.string().optional().nullable(),
  coldTargetId: z.string().min(1)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({
      workspaceId: url.searchParams.get("workspaceId"),
      coldTargetId: url.searchParams.get("coldTargetId")
    });
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const touches = await getPrismaClient().outreachTouch.findMany({
      where: { workspaceId, coldTargetId: input.coldTargetId },
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        channel: true,
        subject: true,
        occurredAt: true,
        outcome: true,
        actorEmail: true
      }
    });

    return NextResponse.json(
      touches.map((touch) => ({
        ...touch,
        authorEmail: touch.actorEmail,
        authorName: accountDisplayName(touch.actorEmail),
        authorCode: accountShortCode(touch.actorEmail)
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
