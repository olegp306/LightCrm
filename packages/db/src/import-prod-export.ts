import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { getPrismaClient } from "./client";

type CsvRow = Record<string, string | undefined>;

const exportRootArg = process.argv[2];

if (!exportRootArg) {
  console.error("Usage: pnpm --filter @lightcrm/db import:prod-export <extracted-export-root>");
  process.exit(1);
}

const exportRoot = resolve(exportRootArg);

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

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

function parseDate(value: string | undefined, fallback = new Date()): Date {
  const raw = text(value);
  if (!raw) {
    return fallback;
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseIntText(value: string | undefined): number | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapLeadStatus(value: string | undefined): string {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "contacted" || normalized === "qualified" || normalized === "lost" || normalized === "converted") {
    return normalized;
  }
  if (normalized === "archived") {
    return "archived";
  }
  return "new";
}

function mapReminderStatus(value: string | undefined): string {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "done" || normalized === "snoozed" || normalized === "archived") {
    return normalized;
  }
  return "open";
}

async function readCsv(name: string): Promise<CsvRow[]> {
  const csv = await fs.readFile(join(exportRoot, name), "utf8");
  return parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true
  }) as CsvRow[];
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

function buildContextBlock(entities: CsvRow[]): string | null {
  if (entities.length === 0) {
    return null;
  }
  const lines = entities.slice(0, 60).map((entity) => {
    const type = text(entity.entityType) ?? "CONTEXT";
    const label = text(entity.label) ?? "Fact";
    const value = text(entity.value) ?? "";
    const confidence = text(entity.confidence);
    return `- [${type}${confidence ? `/${confidence}` : ""}] ${label}: ${value}`;
  });
  const hiddenCount = entities.length - lines.length;
  if (hiddenCount > 0) {
    lines.push(`- ... ${hiddenCount} more context item(s) preserved in the production export.`);
  }
  return ["Parsed context", ...lines].join("\n");
}

function buildLeadNotes(row: CsvRow, contextEntities: CsvRow[]): string | null {
  const rawInput = text(row.rawInput);
  const blocks = [
    noteBlock("Project", text(row.requestType) ?? text(row.lead_name)),
    noteBlock("Area", text(row.bgfM2)),
    noteBlock("Description", extractLeadSummary(rawInput) ?? compact(rawInput, 1400)),
    noteBlock("Interest", text(row.temperature)),
    noteBlock("Urgency", text(row.urgency)),
    noteBlock("Todo", text(row.followupStatus)),
    noteBlock("Address", text(row.projectAddress)),
    noteBlock("Client projects", text(row.projectRecordId)),
    noteBlock("Budget EUR", text(row.budgetEur)),
    noteBlock("Desired start", text(row.desiredStart)),
    noteBlock("Desired move-in", text(row.desiredMoveIn)),
    noteBlock("Missing data", text(row.missing_data_json)),
    noteBlock("Search tags", text(row.search_tags_json)),
    buildContextBlock(contextEntities),
    noteBlock("Raw input", rawInput)
  ].filter(Boolean);
  return blocks.join("\n\n") || null;
}

function buildClientNotes(row: CsvRow): string | null {
  return [
    noteBlock("Client type", text(row.clientType)),
    noteBlock("Language", text(row.language)),
    noteBlock("Address", text(row.address)),
    noteBlock("Referred by", text(row.referredBy)),
    noteBlock("Lead numbers", text(row.lead_numbers)),
    noteBlock("Production notes", text(row.notes))
  ]
    .filter(Boolean)
    .join("\n\n") || null;
}

function leadNumberFromText(value: string | null): string | null {
  return value?.match(/L-\d{4}-\d{3}/)?.[0] ?? null;
}

function messageNumberFromAttachment(row: CsvRow): string | null {
  const storageKey = text(row.storageKey);
  const fileName = text(row.fileName);
  return storageKey?.match(/\/(\d+)-/)?.[1] ?? fileName?.match(/(?:photo-|telegram-|TG-|-)(\d{4})(?:\.|-)/)?.[1] ?? null;
}

function documentKind(fileName: string | null, mimeType: string | null): string {
  const lower = `${fileName ?? ""} ${mimeType ?? ""}`.toLowerCase();
  if (lower.includes("pdf")) {
    return "PDF";
  }
  if (lower.includes("word") || lower.endsWith(".docx")) {
    return "DOCX";
  }
  if (lower.includes("image") || /\.(jpg|jpeg|png|webp)$/i.test(fileName ?? "")) {
    return "Image";
  }
  if (lower.includes("audio") || /\.(m4a|mp3|wav|ogg)$/i.test(fileName ?? "")) {
    return "Audio";
  }
  return "File";
}

async function copyAttachmentToLocalStorage(row: CsvRow, localStorageDir: string): Promise<void> {
  const localExportPath = text(row.local_export_path);
  const storageKey = text(row.storageKey);
  if (!localExportPath || !storageKey) {
    return;
  }
  const sourcePath = join(exportRoot, localExportPath);
  if (!existsSync(sourcePath)) {
    return;
  }
  const destinationPath = join(localStorageDir, storageKey);
  await fs.mkdir(dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function main() {
  await loadRootEnv();
  const prisma = getPrismaClient();
  const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";
  const localStorageDir = resolve(process.env.LOCAL_STORAGE_DIR ?? ".local-storage");
  const [clients, leads, reminders, attachments, generatedDocuments, contextEntities, auditLogs] = await Promise.all([
    readCsv("clients.csv"),
    readCsv("leads.csv"),
    readCsv("reminders_calendar.csv"),
    readCsv("attachments_manifest.csv"),
    readCsv("generated_documents.csv"),
    readCsv("lead_context_entities.csv"),
    readCsv("audit_logs.csv")
  ]);

  const leadsByNumber = new Map(leads.map((lead) => [text(lead.lead_number), lead]).filter((entry): entry is [string, CsvRow] => Boolean(entry[0])));
  const leadsById = new Map(leads.map((lead) => [text(lead.lead_record_id), lead]).filter((entry): entry is [string, CsvRow] => Boolean(entry[0])));
  const clientsById = new Map(clients.map((client) => [text(client.client_record_id), client]).filter((entry): entry is [string, CsvRow] => Boolean(entry[0])));
  const contextByLeadNumber = new Map<string, CsvRow[]>();
  for (const entity of contextEntities) {
    const leadNumber = text(entity.lead_number);
    if (!leadNumber) {
      continue;
    }
    const bucket = contextByLeadNumber.get(leadNumber) ?? [];
    bucket.push(entity);
    contextByLeadNumber.set(leadNumber, bucket);
  }

  const generatedLeadByAttachmentId = new Map<string, CsvRow>();
  for (const document of generatedDocuments) {
    const docxId = text(document.docxAttachmentId);
    const pdfId = text(document.pdfAttachmentId);
    if (docxId) {
      generatedLeadByAttachmentId.set(docxId, document);
    }
    if (pdfId) {
      generatedLeadByAttachmentId.set(pdfId, document);
    }
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
      create: { id: workspaceId, name: "LightCrm local prod-test workspace" },
      update: { name: "LightCrm local prod-test workspace" }
    });

    for (const row of clients) {
      const id = text(row.client_record_id);
      const name = text(row.name);
      if (!id || !name) {
        continue;
      }
      const createdAt = parseDate(row.createdDate);
      await tx.client.create({
        data: {
          id,
          workspaceId,
          code: text(row.client_number),
          name,
          email: text(row.email),
          phone: text(row.phone),
          whatsapp: text(row.whatsapp),
          company: text(row.clientType),
          status: text(row.status) ?? "active",
          notes: buildClientNotes(row),
          sourceChannel: text(row.source),
          externalThreadId: text(row.source),
          externalMessageId: text(row.client_number),
          createdAt,
          updatedAt: createdAt,
          archivedAt: text(row.archivedAt) ? parseDate(row.archivedAt) : null
        }
      });
    }

    for (const row of leads) {
      const id = text(row.lead_record_id);
      if (!id) {
        continue;
      }
      const leadNumber = text(row.lead_number);
      const embeddedClientId = text(row.client_record_id);
      const clientId = embeddedClientId && clientsById.has(embeddedClientId) ? embeddedClientId : null;
      const createdAt = parseDate(row.createdDate);
      const summary = extractLeadSummary(text(row.rawInput));
      await tx.lead.create({
        data: {
          id,
          workspaceId,
          clientId,
          code: leadNumber,
          name: text(row.lead_name) ?? leadNumber ?? id,
          email: text(row.client_email),
          phone: text(row.client_phone),
          whatsapp: text(row.client_whatsapp),
          company: text(row.requestType),
          status: mapLeadStatus(row.status),
          sourceChannel: text(row.client_source) ?? "telegram",
          externalThreadId: text(row.crm_lead_url),
          externalMessageId: leadNumber,
          notes: buildLeadNotes(row, leadNumber ? contextByLeadNumber.get(leadNumber) ?? [] : []),
          createdAt,
          updatedAt: createdAt,
          archivedAt: text(row.archivedAt) ? parseDate(row.archivedAt) : null
        }
      });
      if (summary) {
        await tx.leadSummary.create({
          data: {
            id: `prod_summary_${id}`,
            workspaceId,
            leadId: id,
            shortSummary: compact(summary, 180) ?? summary,
            longSummary: compact(summary, 900),
            source: "prod-export",
            createdAt,
            updatedAt: createdAt
          }
        });
      }
    }

    for (const row of reminders) {
      const id = text(row.calendar_action_id);
      if (!id) {
        continue;
      }
      const lead = text(row.lead_record_id) ? leadsById.get(text(row.lead_record_id) as string) : null;
      const leadId = lead ? text(lead.lead_record_id) : null;
      const clientId = text(row.client_record_id) && clientsById.has(text(row.client_record_id) as string) ? text(row.client_record_id) : null;
      const createdAt = parseDate(row.createdAt);
      const dueAt = parseDate(row.dueAt, createdAt);
      const description = [
        text(row.description),
        text(row.dueAt) ? null : "Imported with empty production dueAt; using createdAt as local calendar placement.",
        noteBlock("Production status", text(row.status)),
        noteBlock("Production source message", text(row.sourceMessageId))
      ]
        .filter(Boolean)
        .join("\n\n") || null;
      await tx.reminder.create({
        data: {
          id,
          workspaceId,
          clientId,
          leadId,
          title: text(row.title) ?? "Imported reminder",
          description,
          dueAt,
          status: mapReminderStatus(row.status),
          sourceChannel: text(row.sourceChannel),
          createdAt,
          updatedAt: parseDate(row.updatedAt, createdAt)
        }
      });
      await tx.calendarEvent.create({
        data: {
          id: `event_${id}`,
          workspaceId,
          clientId,
          leadId,
          reminderId: id,
          title: text(row.title) ?? "Imported calendar action",
          description,
          startsAt: dueAt,
          endsAt: new Date(dueAt.getTime() + 30 * 60 * 1000),
          location: null,
          externalProvider: "prod-export",
          externalEventId: id,
          syncStatus: text(row.status),
          createdAt,
          updatedAt: parseDate(row.updatedAt, createdAt)
        }
      });
    }

    for (const row of attachments) {
      const id = text(row.attachment_id);
      const fileName = text(row.fileName);
      const storageKey = text(row.storageKey);
      if (!id || !fileName || !storageKey) {
        continue;
      }
      let leadNumber = leadNumberFromText(text(row.raw_input_lead_numbers));
      leadNumber ??= text(generatedLeadByAttachmentId.get(id)?.lead_number);
      const messageNumber = messageNumberFromAttachment(row);
      if (!leadNumber && messageNumber) {
        for (const leadRow of leads) {
          const raw = text(leadRow.rawInput);
          if (raw?.includes(messageNumber)) {
            leadNumber = text(leadRow.lead_number);
            break;
          }
        }
      }
      const lead = leadNumber ? leadsByNumber.get(leadNumber) : null;
      const leadId = lead ? text(lead.lead_record_id) : null;
      const clientId = lead && text(lead.client_record_id) && clientsById.has(text(lead.client_record_id) as string) ? text(lead.client_record_id) : null;
      const generated = generatedLeadByAttachmentId.get(id);
      const kind = documentKind(fileName, text(row.mimeType));
      const shortSummary = generated
        ? `Generated ${text(generated.documentType) ?? "document"} ${kind} for ${leadNumber ?? "lead"}.`
        : `${kind} imported from production export${leadNumber ? ` for ${leadNumber}` : ""}.`;
      const longSummary = [
        noteBlock("Export classification", text(row.export_classification)),
        noteBlock("Production source", text(row.source)),
        noteBlock("Production open URL", text(row.crm_open_url)),
        generated ? noteBlock("Generated document", text(generated.generated_document_id)) : null,
        generated ? noteBlock("Generated status", text(generated.status)) : null
      ]
        .filter(Boolean)
        .join("\n\n") || null;
      await tx.documentFile.create({
        data: {
          id,
          workspaceId,
          clientId,
          leadId,
          fileName,
          shortSummary,
          longSummary,
          downloadUrl: `/api/crm/storage/local/${encodeURIComponent(storageKey)}`,
          storageProvider: "local",
          storageBucket: null,
          storageKey,
          mimeType: text(row.mimeType),
          sizeBytes: parseIntText(row.sizeBytes),
          createdAt: parseDate(row.createdAt),
          updatedAt: parseDate(row.createdAt)
        }
      });
    }

    for (const row of auditLogs) {
      const id = text(row.audit_log_id);
      if (!id) {
        continue;
      }
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(text(row.metadata_json) ?? "{}") as Record<string, unknown>;
      } catch {
        metadata = { raw: text(row.metadata_json) };
      }
      metadata.inferredLeadNumber = text(row.inferred_lead_number);
      metadata.inferredLeadUrl = text(row.inferred_lead_url);
      await tx.auditLog.create({
        data: {
          id,
          workspaceId,
          actorId: text(row.actorUserId),
          action: text(row.action) ?? "prod.import",
          entity: "auditLog",
          entityId: text(row.targetId) ?? id,
          metadata: metadata as Prisma.InputJsonObject,
          createdAt: parseDate(row.createdAt)
        }
      });
    }
  }, { timeout: 60_000 });

  for (const attachment of attachments) {
    await copyAttachmentToLocalStorage(attachment, localStorageDir);
  }

  const [clientCount, leadCount, reminderCount, eventCount, documentCount, summaryCount, auditLogCount] = await Promise.all([
    prisma.client.count({ where: { workspaceId } }),
    prisma.lead.count({ where: { workspaceId } }),
    prisma.reminder.count({ where: { workspaceId } }),
    prisma.calendarEvent.count({ where: { workspaceId } }),
    prisma.documentFile.count({ where: { workspaceId } }),
    prisma.leadSummary.count({ where: { workspaceId } }),
    prisma.auditLog.count({ where: { workspaceId } })
  ]);

  console.log(JSON.stringify({
    workspaceId,
    exportRoot,
    localStorageDir,
    clients: clientCount,
    leads: leadCount,
    reminders: reminderCount,
    calendarEvents: eventCount,
    documentFiles: documentCount,
    leadSummaries: summaryCount,
    auditLogs: auditLogCount,
    copiedFiles: attachments.length,
    firstFile: attachments[0] ? join(localStorageDir, text(attachments[0].storageKey) ?? "") : null
  }, null, 2));
}

main()
  .then(async () => {
    await getPrismaClient().$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await getPrismaClient().$disconnect();
    process.exit(1);
  });
