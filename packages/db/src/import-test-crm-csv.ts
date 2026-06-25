import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

type CsvRow = Record<string, string | undefined>;

const clientsPath = process.argv[2];
const leadsPath = process.argv[3];

if (!clientsPath || !leadsPath) {
  console.error("Usage: pnpm --filter @lightcrm/db exec tsx src/import-test-crm-csv.ts <clients.csv> <leads.csv>");
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
    const rawValue = match[2].trim();
    process.env[match[1]] = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

function text(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDate(value: string | undefined, fallback = new Date()): Date {
  const raw = text(value);
  if (!raw) {
    return fallback;
  }
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function compact(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function slug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const digest = createHash("sha1").update(value).digest("hex").slice(0, 10);
  return `${ascii || "record"}-${digest}`.slice(0, 80);
}

function clientIdFromCode(code: string): string {
  return `csv-client-${slug(code)}`;
}

function leadIdFromCode(code: string): string {
  return `csv-lead-${slug(code)}`;
}

function noteBlock(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null;
}

function extractLeadSummary(rawInput: string | null): string | null {
  if (!rawInput) {
    return null;
  }
  const match = rawInput.match(/Lead summary:\s*([\s\S]*?)(?=\nSource material summaries:|\nSuggested reply:|\n(?:Telegram|TG) lead card:|$)/);
  return match?.[1]?.trim() || null;
}

function buildClientNotes(row: CsvRow, extra: string[] = []): string | null {
  return [
    noteBlock("Type", text(row.Type)),
    noteBlock("Language", text(row.Language)),
    noteBlock("Address", text(row.Address)),
    noteBlock("Referred by", text(row["Referred by"])),
    noteBlock("Notes", text(row.Notes)),
    ...extra
  ]
    .filter(Boolean)
    .join("\n\n") || null;
}

function buildLeadNotes(row: CsvRow): string | null {
  const leadName = text(row["Lead name"]) ?? text(row.Project);
  return [
    noteBlock("Lead name", leadName),
    noteBlock("Area", text(row.Area)),
    noteBlock("Description", text(row.Description)),
    noteBlock("Interest", text(row.Interest)),
    noteBlock("Urgency", text(row.Urgency)),
    noteBlock("Todo", text(row.Todo)),
    noteBlock("Address", text(row.Address)),
    noteBlock("Client projects", text(row["Client projects"])),
    noteBlock("Budget EUR", text(row["Budget EUR"])),
    noteBlock("Desired start", text(row["Desired start"])),
    noteBlock("Desired move-in", text(row["Desired move-in"])),
    noteBlock("Wohnflaeche m2", text(row["Wohnflaeche m2"])),
    noteBlock("Standard", text(row.Standard)),
    noteBlock("Missing data", text(row["Missing data"])),
    noteBlock("KP document", text(row["KP document"])),
    noteBlock("KP sent", text(row["KP sent"])),
    noteBlock("Follow-up date", text(row["Follow-up date"])),
    noteBlock("Follow-up status", text(row["Follow-up status"])),
    noteBlock("Outcome", text(row.Outcome)),
    noteBlock("Outcome reason", text(row["Outcome reason"])),
    noteBlock("Project ID", text(row["Project ID"])),
    noteBlock("Raw input", text(row["Raw input"]))
  ]
    .filter(Boolean)
    .join("\n\n") || null;
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

type AttachmentRef = {
  leadCode: string;
  leadId: string;
  clientId: string | null;
  kind: string;
  fileId: string;
  label: string;
  index: number;
};

function attachmentRefs(row: CsvRow, leadId: string, clientId: string | null): AttachmentRef[] {
  const raw = text(row["Raw input"]);
  const leadCode = text(row["Lead ID"]);
  if (!raw || !leadCode) {
    return [];
  }
  const refs: AttachmentRef[] = [];
  const bracketPattern = /\[Telegram (image|audio|voice|pdf|document|other) attachment: ([^\]\s]+)\]/gi;
  for (const match of raw.matchAll(bracketPattern)) {
    refs.push({
      leadCode,
      leadId,
      clientId,
      kind: match[1].toLowerCase(),
      fileId: match[2],
      label: match[1].toLowerCase(),
      index: refs.length + 1
    });
  }
  const sourcePattern = /Telegram attachment\s+\d+:\s+([a-z]+)\s+\([^)]*\)(?:.*?source\s+([A-Za-z0-9_-]+))?/gi;
  for (const match of raw.matchAll(sourcePattern)) {
    const fileId = match[2];
    if (!fileId || refs.some((ref) => ref.fileId === fileId)) {
      continue;
    }
    refs.push({
      leadCode,
      leadId,
      clientId,
      kind: match[1].toLowerCase(),
      fileId,
      label: match[1].toLowerCase(),
      index: refs.length + 1
    });
  }
  return refs;
}

function mimeFromFileName(fileName: string, fallbackKind: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".m4a")) {
    return "audio/mp4";
  }
  if (lower.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (fallbackKind === "image") {
    return "image/jpeg";
  }
  if (fallbackKind === "audio" || fallbackKind === "voice") {
    return "audio/mp4";
  }
  return null;
}

async function downloadTelegramAttachment(ref: AttachmentRef, token: string, storageRoot: string) {
  const apiBase = `https://api.telegram.org/bot${token}`;
  const fileResponse = await fetch(`${apiBase}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: ref.fileId })
  });
  const filePayload = (await fileResponse.json()) as { ok: boolean; result?: { file_path?: string; file_size?: number }; description?: string };
  if (!fileResponse.ok || !filePayload.ok || !filePayload.result?.file_path) {
    throw new Error(filePayload.description ?? `Telegram getFile failed for ${ref.fileId}`);
  }
  const sourcePath = filePayload.result.file_path;
  const extension = extname(sourcePath) || (ref.kind === "image" ? ".jpg" : "");
  const fileName = `telegram-${ref.kind}-${ref.index}-${ref.fileId.slice(0, 12)}${extension}`;
  const storageKey = `workspaces/test/leads/${ref.leadCode.toLowerCase()}/${fileName}`;
  const destination = join(storageRoot, storageKey);
  await fs.mkdir(dirname(destination), { recursive: true });
  const download = await fetch(`https://api.telegram.org/file/bot${token}/${sourcePath}`);
  if (!download.ok) {
    throw new Error(`Telegram file download failed for ${ref.fileId}: ${download.status}`);
  }
  const bytes = Buffer.from(await download.arrayBuffer());
  await fs.writeFile(destination, bytes);
  return {
    fileName,
    storageKey,
    mimeType: mimeFromFileName(fileName, ref.kind),
    sizeBytes: bytes.length
  };
}

async function main() {
  await loadRootEnv();
  const prisma = new PrismaClient();
  const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "test";
  const storageRoot = resolve(process.env.LOCAL_STORAGE_DIR ?? ".local-storage");
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const [clientRows, leadRows] = await Promise.all([readCsv(clientsPath), readCsv(leadsPath)]);
  const clientsByName = new Map<string, { id: string; row: CsvRow | null }>();

  for (const row of clientRows) {
    const name = text(row.Name);
    if (!name) {
      continue;
    }
    const code = text(row["Client ID"]);
    const id = code ? clientIdFromCode(code) : `csv-client-${slug(name)}`;
    clientsByName.set(name, { id, row });
  }

  for (const row of leadRows) {
    const name = text(row.Client);
    if (!name || clientsByName.has(name)) {
      continue;
    }
    clientsByName.set(name, { id: `csv-client-${slug(name)}`, row: null });
  }

  const leadLinks = new Map<string, { leadId: string; clientId: string | null; row: CsvRow }>();
  for (const row of leadRows) {
    const leadCode = text(row["Lead ID"]);
    if (!leadCode) {
      continue;
    }
    const clientName = text(row.Client);
    leadLinks.set(leadCode, {
      leadId: leadIdFromCode(leadCode),
      clientId: clientName ? clientsByName.get(clientName)?.id ?? null : null,
      row
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { workspaceId } });
    await tx.calendarEvent.deleteMany({ where: { workspaceId } });
    await tx.reminder.deleteMany({ where: { workspaceId } });
    await tx.outreachTouch.deleteMany({ where: { workspaceId } });
    await tx.documentFile.deleteMany({ where: { workspaceId } });
    await tx.leadSummary.deleteMany({ where: { workspaceId } });
    await tx.lead.deleteMany({ where: { workspaceId } });
    await tx.client.deleteMany({ where: { workspaceId } });
    await tx.coldTarget.deleteMany({ where: { workspaceId } });
    await tx.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: "LightCrm test workspace" },
      update: { name: "LightCrm test workspace" }
    });

    for (const [name, client] of clientsByName.entries()) {
      const row = client.row;
      const createdAt = parseDate(row?.Created);
      await tx.client.create({
        data: {
          id: client.id,
          workspaceId,
          code: text(row?.["Client ID"]),
          name,
          email: text(row?.Email),
          phone: text(row?.Phone),
          whatsapp: null,
          company: text(row?.Type),
          address: text(row?.Address),
          status: text(row?.Status) ?? "active",
          notes: buildClientNotes(row ?? {}, row ? [] : ["Created from lead CSV to keep lead-client links."]),
          sourceChannel: text(row?.Source) ?? "import",
          externalThreadId: text(row?.Source),
          externalMessageId: text(row?.["Client ID"]),
          createdAt,
          updatedAt: createdAt
        }
      });
    }

    for (const { leadId, clientId, row } of leadLinks.values()) {
      const createdAt = parseDate(row.Created);
      const leadSummary = extractLeadSummary(text(row["Raw input"]));
      await tx.lead.create({
        data: {
          id: leadId,
          workspaceId,
          clientId,
          code: text(row["Lead ID"]),
          name: text(row["Lead name"]) ?? text(row.Project) ?? text(row.Client) ?? leadId,
          email: text(row.Email),
          phone: text(row.Phone),
          whatsapp: text(row.Messenger),
          company: text(row.Project),
          status: text(row.Status) ?? "new",
          sourceChannel: text(row.Source) ?? "import",
          externalThreadId: text(row["Project ID"]),
          externalMessageId: text(row["Lead ID"]),
          notes: buildLeadNotes(row),
          createdAt,
          updatedAt: createdAt
        }
      });
      if (leadSummary) {
        await tx.leadSummary.create({
          data: {
            id: `csv-summary-${slug(leadId)}`,
            workspaceId,
            leadId,
            shortSummary: compact(leadSummary, 180) ?? leadSummary,
            longSummary: compact(leadSummary, 1200),
            source: "csv-import",
            createdAt,
            updatedAt: createdAt
          }
        });
      }
    }
  }, { timeout: 60_000 });

  const attachmentReport: Array<{ leadCode: string; fileId: string; ok: boolean; error?: string }> = [];
  let documentCount = 0;
  for (const { leadId, clientId, row } of leadLinks.values()) {
    for (const ref of attachmentRefs(row, leadId, clientId)) {
      try {
        if (!telegramToken) {
          throw new Error("TELEGRAM_BOT_TOKEN is not configured");
        }
        const stored = await downloadTelegramAttachment(ref, telegramToken, storageRoot);
        await prisma.documentFile.create({
          data: {
            id: `csv-doc-${slug(`${ref.leadCode}-${ref.fileId}-${ref.index}`)}`,
            workspaceId,
            clientId,
            leadId,
            fileName: stored.fileName,
            shortSummary: `Telegram ${ref.kind} attachment imported from CSV for ${ref.leadCode}.`,
            longSummary: `Telegram file_id: ${ref.fileId}`,
            downloadUrl: `/api/crm/storage/local/${encodeURIComponent(stored.storageKey)}`,
            storageProvider: "local",
            storageBucket: null,
            storageKey: stored.storageKey,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            createdAt: parseDate(row.Created),
            updatedAt: parseDate(row.Created)
          }
        });
        documentCount += 1;
        attachmentReport.push({ leadCode: ref.leadCode, fileId: ref.fileId, ok: true });
      } catch (error) {
        attachmentReport.push({
          leadCode: ref.leadCode,
          fileId: ref.fileId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const counts = {
    clients: await prisma.client.count({ where: { workspaceId } }),
    leads: await prisma.lead.count({ where: { workspaceId } }),
    documents: await prisma.documentFile.count({ where: { workspaceId } }),
    summaries: await prisma.leadSummary.count({ where: { workspaceId } })
  };
  console.log(JSON.stringify({ workspaceId, counts, downloadedDocuments: documentCount, attachmentReport }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
