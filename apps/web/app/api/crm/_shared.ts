import { createCrmService, MemoryCrmRepository, type CrmCollection } from "@lightcrm/core";
import { createPrismaCrmRepository, getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const globalForCrm = globalThis as unknown as {
  lightCrmRepository?: MemoryCrmRepository;
};

function getMemoryRepository() {
  const repository = globalForCrm.lightCrmRepository ?? new MemoryCrmRepository();
  globalForCrm.lightCrmRepository = repository;
  return repository;
}

export function getCrm() {
  const databaseUrl = process.env.DATABASE_URL;
  const useMemoryRepository = process.env.LIGHTCRM_REPOSITORY === "memory" || process.env.NODE_ENV === "test";
  if (!databaseUrl && !useMemoryRepository) {
    throw new Error("DATABASE_URL is required. Set LIGHTCRM_REPOSITORY=memory only for explicit in-memory testing.");
  }
  const repository = useMemoryRepository ? getMemoryRepository() : createPrismaCrmRepository(getPrismaClient());
  return createCrmService(repository);
}

export const dateString = z.string().datetime().transform((value) => new Date(value));

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseJson<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  const body = await request.json();
  return schema.parse(body);
}

export function handleRouteError(error: unknown) {
  if (error instanceof z.ZodError) {
    return jsonError(
      error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "request";
          return `${path}: ${issue.message}`;
        })
        .join("; ")
    );
  }
  if (error instanceof Error) {
    return jsonError(error.message);
  }
  return jsonError("Unexpected request error", 500);
}

export const optionalText = z.string().trim().min(1).nullable().optional();

export const defaultWorkspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";

export function resolveWorkspaceId(value: string | null | undefined) {
  return !value || value === "default" ? defaultWorkspaceId : value;
}

function displaySourceChannel(value: unknown): unknown {
  return typeof value === "string" && value.toLocaleLowerCase() === "telegram" ? "TG" : value;
}

function displayRecordSourceChannel<TRecord>(record: TRecord): TRecord {
  if (!record || typeof record !== "object" || !("sourceChannel" in record)) {
    return record;
  }
  return {
    ...record,
    sourceChannel: displaySourceChannel((record as { sourceChannel?: unknown }).sourceChannel)
  };
}

export const workspaceId = z.string().min(1).transform(resolveWorkspaceId);

export function tableRowsResponse(entity: CrmCollection) {
  return async function GET(request: Request) {
    try {
      const url = new URL(request.url);
      const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const rows = await getCrm().listRecords({ entity, workspaceId, includeArchived });
      return NextResponse.json(rows.map(displayRecordSourceChannel));
    } catch (error) {
      return handleRouteError(error);
    }
  };
}
