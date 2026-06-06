import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, workspaceId } from "../_shared";

const schema = z.object({
  workspaceId,
  query: z.string().trim().min(1)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = schema.parse({
      workspaceId: url.searchParams.get("workspaceId"),
      query: url.searchParams.get("query")
    });
    return NextResponse.json(await getCrm().globalSearch(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
