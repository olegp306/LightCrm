import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  lightCrmPrisma?: PrismaClient;
};

export function withDefaultConnectionLimit(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) {
    return databaseUrl;
  }
  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", process.env.LIGHTCRM_PRISMA_CONNECTION_LIMIT ?? "5");
    }
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

export function getPrismaClient() {
  const prisma =
    globalForPrisma.lightCrmPrisma ??
    new PrismaClient({
      datasources: {
        db: {
          url: withDefaultConnectionLimit(process.env.DATABASE_URL)
        }
      }
    });
  globalForPrisma.lightCrmPrisma = prisma;
  return prisma;
}
