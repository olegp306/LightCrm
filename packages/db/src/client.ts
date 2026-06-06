import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  lightCrmPrisma?: PrismaClient;
};

export function getPrismaClient() {
  const prisma = globalForPrisma.lightCrmPrisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.lightCrmPrisma = prisma;
  }
  return prisma;
}
