import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { createCrmService } from "@lightcrm/core";
import { getPrismaClient } from "./client";
import { createPrismaCrmRepository } from "./prisma-repository";
import { mapLeadCsvRow, type LeadCsvRow } from "./csv-leads";

const csvPath = process.argv[2];
const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";

if (!csvPath) {
  console.error("Usage: pnpm --filter @lightcrm/db import:leads <path-to-csv>");
  process.exit(1);
}

const prisma = getPrismaClient();
const crm = createCrmService(createPrismaCrmRepository(prisma));

async function main() {
  const csv = await fs.readFile(csvPath, "utf8");
  const rows = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true
  }) as LeadCsvRow[];

  for (const [index, row] of rows.entries()) {
    const mapped = mapLeadCsvRow(row, workspaceId, index);
    await crm.upsertClient(mapped.client);
    await crm.upsertLead(mapped.lead);
  }

  console.log(`Imported ${rows.length} lead rows into workspace "${workspaceId}".`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
