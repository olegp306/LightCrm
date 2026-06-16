import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  lightCrmPrisma?: PrismaClient;
};

export function getPrismaClient() {
  const prisma = globalForPrisma.lightCrmPrisma ?? new PrismaClient();
  globalForPrisma.lightCrmPrisma = prisma;
  return prisma;
}
