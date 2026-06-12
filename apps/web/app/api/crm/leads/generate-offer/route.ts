import { NextResponse } from "next/server";
import { getCrm, handleRouteError, resolveWorkspaceId } from "../../_shared";
import { generateCommercialOfferForLead } from "../commercial-offers";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { workspaceId?: string; leadId?: string };
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    if (!input.leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    try {
      return NextResponse.json(
        await generateCommercialOfferForLead({
          crm: getCrm(),
          workspaceId,
          leadId: input.leadId
        })
      );
    } catch (error) {
      const readiness = error instanceof Error ? (error as Error & { readiness?: unknown }).readiness : undefined;
      if (readiness) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Commercial offer generation failed", readiness },
          { status: 400 }
        );
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
