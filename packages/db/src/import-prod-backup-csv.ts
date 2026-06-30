import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

type CsvRow = Record<string, string | undefined>;

const confirmFlag = "--confirm-local-default";
const positionalArgs = process.argv.slice(2).filter((arg) => arg !== confirmFlag);
const [clientsPath, coldTargetsPath, leadsPath, storagePath] = positionalArgs;

if (!clientsPath || !coldTargetsPath || !leadsPath || !storagePath || !process.argv.includes(confirmFlag)) {
  console.error(
    `Usage: pnpm --filter @lightcrm/db exec tsx src/import-prod-backup-csv.ts ${confirmFlag} <clients.csv> <cold-targets.csv> <leads.csv> <storage.csv>`
  );
  process.exit(1);
}

async function loadRootEnv() {
  const envPath = resolve(process.cwd(), "../../.env");
  if (!existsSync(envPath)) {
    return;
  }
  const envText = await fs.readFile(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

function text(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function slug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const digest = createHash("sha1").update(value).digest("hex").slice(0, 10);
  return `${(ascii || "record").slice(0, 68).replace(/-+$/g, "")}-${digest}`;
}

function parseDate(value: string | undefined | null, fallback = new Date()): Date {
  const raw = text(value);
  if (!raw) {
    return fallback;
  }
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function assertLocalDatabaseTarget(databaseUrl: string | undefined, workspaceId: string) {
  if (workspaceId !== "default") {
    throw new Error(`Refusing destructive import into workspace "${workspaceId}". This script is scoped to local default only.`);
  }
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for destructive import.");
  }
  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (parsed.protocol !== "postgresql:" || !localHosts.has(parsed.hostname) || parsed.port !== "54329") {
    throw new Error(`Refusing destructive import into non-local database target: ${parsed.host}`);
  }
}

function readCsv(path: string): Promise<CsvRow[]> {
  return fs.readFile(path, "utf8").then((csv) =>
    parse(csv, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true
    }) as CsvRow[]
  );
}

function clientIdFromCode(code: string): string {
  return `prod-client-${slug(code)}`;
}

function clientIdFromName(name: string): string {
  return `prod-client-${slug(name)}`;
}

function leadIdFromCode(code: string): string {
  return `prod-lead-${slug(code)}`;
}

function coldTargetIdFromCode(code: string): string {
  return `prod-cold-${slug(code)}`;
}

function noteBlock(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null;
}

function buildLeadNotes(row: CsvRow): string | null {
  return [
    noteBlock("Lead name", text(row["Lead name"])),
    noteBlock("Area", text(row.Area)),
    noteBlock("Description", text(row.Description)),
    noteBlock("Interest", text(row.Interest)),
    noteBlock("Urgency", text(row.Urgency)),
    noteBlock("Todo", text(row.Todo)),
    noteBlock("Ball side", text(row.Ball)),
    noteBlock("Address", text(row.Address))
  ]
    .filter(Boolean)
    .join("\n\n") || null;
}

function calendarItems(value: string | undefined | null): Array<{ startsAt: Date; title: string }> {
  const raw = text(value);
  if (!raw) {
    return [];
  }
  return raw
    .split(";")
    .map((item) => item.trim())
    .flatMap((item) => {
      const match = item.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(.+)$/);
      if (!match) {
        return [];
      }
      const startsAt = parseDate(match[1], new Date("2026-01-01T12:00:00.000Z"));
      return [{ startsAt, title: match[2].trim() }];
    });
}

function touchIndex(value: string | null): number {
  const match = value?.match(/touch\s+(\d+)/i);
  const parsed = match ? Number(match[1]) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : 0;
}

function nextActionParts(value: string | null): { title: string | null; date: Date | null } {
  if (!value) {
    return { title: null, date: null };
  }
  const [titlePart, datePart] = value.split("·").map((part) => part.trim());
  return {
    title: titlePart || null,
    date: datePart ? parseDate(datePart, new Date("2026-01-01T12:00:00.000Z")) : null
  };
}

function storageKeyFromDownload(download: string | null, fileName: string, added: string | null): string {
  if (download) {
    const marker = "/api/crm/storage/local/";
    const index = download.indexOf(marker);
    if (index >= 0) {
      return decodeURIComponent(download.slice(index + marker.length));
    }
  }
  return `workspaces/prod/imported/${slug(`${fileName}-${added ?? ""}`)}/${fileName}`;
}

function mimeFromFileName(fileName: string): string | null {
  const extension = extname(fileName).toLowerCase();
  const byExtension: Record<string, string> = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".webp": "image/webp"
  };
  return byExtension[extension] ?? null;
}

function documentNames(row: CsvRow): string[] {
  return (text(row.Documents) ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  await loadRootEnv();
  const prisma = new PrismaClient();
  const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";
  assertLocalDatabaseTarget(process.env.DATABASE_URL, workspaceId);
  const now = new Date("2026-06-30T12:00:00.000Z");
  const [clientRows, coldTargetRows, leadRows, storageRows] = await Promise.all([
    readCsv(clientsPath),
    readCsv(coldTargetsPath),
    readCsv(leadsPath),
    readCsv(storagePath)
  ]);

  const clientsByName = new Map<string, { id: string; row: CsvRow | null }>();
  for (const row of clientRows) {
    const name = text(row.Name);
    if (!name) {
      continue;
    }
    const code = text(row["Client ID"]);
    clientsByName.set(name, { id: code ? clientIdFromCode(code) : clientIdFromName(name), row });
  }
  for (const row of leadRows) {
    const clientName = text(row.Client);
    if (clientName && !clientsByName.has(clientName)) {
      clientsByName.set(clientName, { id: clientIdFromName(clientName), row: null });
    }
  }

  const leadsByCode = new Map<string, { id: string; row: CsvRow; clientId: string | null }>();
  const leadIdByName = new Map<string, string>();
  const leadQueuesByDocumentName = new Map<string, string[]>();
  for (const row of leadRows) {
    const code = text(row["Lead ID"]);
    if (!code) {
      continue;
    }
    const id = leadIdFromCode(code);
    const clientName = text(row.Client);
    const clientId = clientName ? clientsByName.get(clientName)?.id ?? null : null;
    leadsByCode.set(code, { id, row, clientId });
    const leadName = text(row["Lead name"]);
    if (leadName) {
      leadIdByName.set(leadName, id);
    }
    for (const documentName of documentNames(row)) {
      leadQueuesByDocumentName.set(documentName, [...(leadQueuesByDocumentName.get(documentName) ?? []), id]);
    }
  }
  const ambiguousDocumentFileNames = [...leadQueuesByDocumentName.entries()]
    .filter(([, leadIds]) => leadIds.length > 1)
    .map(([fileName, leadIds]) => ({ fileName, leadIds: [...leadIds] }));

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { workspaceId } });
    await tx.calendarEvent.deleteMany({ where: { workspaceId } });
    await tx.reminder.deleteMany({ where: { workspaceId } });
    await tx.outreachTouch.deleteMany({ where: { workspaceId } });
    await tx.outreachCampaignAssignment.deleteMany({ where: { workspaceId } });
    await tx.documentFile.deleteMany({ where: { workspaceId } });
    await tx.leadSummary.deleteMany({ where: { workspaceId } });
    await tx.lead.deleteMany({ where: { workspaceId } });
    await tx.coldTarget.deleteMany({ where: { workspaceId } });
    await tx.client.deleteMany({ where: { workspaceId } });
    await tx.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: "LightCrm local test workspace" },
      update: { name: "LightCrm local test workspace" }
    });

    for (const [name, client] of clientsByName.entries()) {
      const row = client.row;
      await tx.client.create({
        data: {
          id: client.id,
          workspaceId,
          code: text(row?.["Client ID"]),
          name,
          company: text(row?.Company),
          email: text(row?.Email),
          phone: text(row?.Phone),
          address: text(row?.Address),
          status: text(row?.Status) ?? "active",
          sourceChannel: "csv-backup",
          notes: text(row?.Notes) ?? (row ? null : "Created from lead backup to preserve lead-client link."),
          createdAt: now,
          updatedAt: now
        }
      });
    }

    for (const row of coldTargetRows) {
      const code = text(row["Target ID"]);
      const name = text(row.Name);
      if (!code || !name) {
        continue;
      }
      const coldTargetId = coldTargetIdFromCode(code);
      await tx.coldTarget.create({
        data: {
          id: coldTargetId,
          workspaceId,
          code,
          name,
          company: text(row.Company),
          role: text(row.Role),
          email: text(row.Email),
          phone: text(row.Phone),
          website: text(row.Website),
          linkedinUrl: text(row.LinkedIn),
          preferredLanguage: text(row.Language),
          notesResearch: text(row["Node Research"]),
          archivedLetters: text(row["I Have Letters"]),
          status: text(row.Status) ?? "new",
          source: "csv-backup",
          createdAt: now,
          updatedAt: now
        }
      });
      const campaignName = text(row.Campaign);
      if (campaignName) {
        const nextAction = nextActionParts(text(row["Next action"]));
        await tx.outreachCampaignAssignment.create({
          data: {
            id: `prod-assignment-${slug(`${code}-${campaignName}`)}`,
            workspaceId,
            coldTargetId,
            campaignId: slug(campaignName),
            campaignName,
            status: "active",
            currentTouchIndex: touchIndex(text(row.Touch)),
            nextActionTitle: nextAction.title,
            nextTouchAt: nextAction.date,
            createdAt: now,
            updatedAt: now
          }
        });
      }
      for (const [index, item] of calendarItems(row.Calendar).entries()) {
        await tx.reminder.create({
          data: {
            id: `prod-reminder-cold-${slug(`${code}-${item.startsAt.toISOString()}-${item.title}-${index}`)}`,
            workspaceId,
            coldTargetId,
            title: item.title,
            dueAt: item.startsAt,
            status: "planned",
            sourceChannel: "csv-backup",
            createdAt: now,
            updatedAt: now
          }
        });
      }
    }

    for (const { id, row, clientId } of leadsByCode.values()) {
      const leadName = text(row["Lead name"]) ?? text(row.Client) ?? id;
      await tx.lead.create({
        data: {
          id,
          workspaceId,
          clientId,
          code: text(row["Lead ID"]),
          name: leadName,
          company: leadName,
          email: text(row.Email),
          phone: text(row.Phone),
          whatsapp: text(row.Messenger),
          status: "new",
          sourceChannel: text(row.Source) ?? "csv-backup",
          notes: buildLeadNotes(row),
          createdAt: now,
          updatedAt: now
        }
      });
      for (const [index, item] of calendarItems(row.Calendar).entries()) {
        await tx.reminder.create({
          data: {
            id: `prod-reminder-lead-${slug(`${id}-${item.startsAt.toISOString()}-${item.title}-${index}`)}`,
            workspaceId,
            leadId: id,
            clientId,
            title: item.title,
            dueAt: item.startsAt,
            status: "planned",
            sourceChannel: "csv-backup",
            createdAt: now,
            updatedAt: now
          }
        });
      }
    }

    const documentLinkReport = {
      linkedByLeadDocumentList: 0,
      linkedByExactLeadName: 0,
      linkedByExactClientName: 0,
      unlinked: 0,
      ambiguousFileNames: ambiguousDocumentFileNames
    };

    for (const row of storageRows) {
      const fileName = text(row["File name"]);
      if (!fileName) {
        continue;
      }
      const queue = leadQueuesByDocumentName.get(fileName) ?? [];
      let leadId: string | null = queue.shift() ?? null;
      if (leadId) {
        documentLinkReport.linkedByLeadDocumentList += 1;
      } else {
        const linkedLeadId = leadIdByName.get(text(row["Linked to"]) ?? "") ?? null;
        if (linkedLeadId) {
          leadId = linkedLeadId;
          documentLinkReport.linkedByExactLeadName += 1;
        }
      }
      if (queue.length > 0) {
        leadQueuesByDocumentName.set(fileName, queue);
      } else {
        leadQueuesByDocumentName.delete(fileName);
      }
      const lead = leadId ? [...leadsByCode.values()].find((item) => item.id === leadId) ?? null : null;
      const linkedTo = text(row["Linked to"]);
      const clientId = lead?.clientId ?? (linkedTo ? clientsByName.get(linkedTo)?.id ?? null : null);
      if (!leadId && clientId) {
        documentLinkReport.linkedByExactClientName += 1;
      }
      if (!leadId && !clientId) {
        documentLinkReport.unlinked += 1;
      }
      const added = text(row.Added);
      const storageKey = storageKeyFromDownload(text(row.Download), fileName, added);
      await tx.documentFile.create({
        data: {
          id: `prod-doc-${slug(`${fileName}-${added ?? ""}-${storageKey}`)}`,
          workspaceId,
          leadId,
          clientId,
          fileName,
          shortSummary: text(row.Summary) ?? fileName,
          longSummary: text(row["Full summary"]),
          downloadUrl: text(row.Download),
          storageProvider: "local",
          storageBucket: null,
          storageKey,
          mimeType: mimeFromFileName(fileName),
          createdAt: parseDate(row.Added, now),
          updatedAt: parseDate(row.Added, now)
        }
      });
    }
    console.log(JSON.stringify({ documentLinkReport }, null, 2));
  }, { timeout: 60_000 });

  const counts = {
    clients: await prisma.client.count({ where: { workspaceId } }),
    coldTargets: await prisma.coldTarget.count({ where: { workspaceId } }),
    leads: await prisma.lead.count({ where: { workspaceId } }),
    documents: await prisma.documentFile.count({ where: { workspaceId } }),
    reminders: await prisma.reminder.count({ where: { workspaceId } }),
    campaignAssignments: await prisma.outreachCampaignAssignment.count({ where: { workspaceId } })
  };
  console.log(JSON.stringify({ workspaceId, counts }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
