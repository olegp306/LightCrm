import { evaluateCommercialOfferReadiness } from "@lightcrm/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultWorkspaceId, getCrm, handleRouteError, parseJson, resolveWorkspaceId } from "../../_shared";
import { getCrmRuntimeSettings } from "../../settings/crm-settings-store";
import { leadNoteFields, readNoteField } from "../note-fields";

const SendToTelegramInput = z.object({
  workspaceId: z.string().min(1).optional(),
  leadIds: z.array(z.string().min(1)).min(1).max(20),
  chatId: z.number().int().optional()
});

type TelegramButton = { text: string; url?: string; web_app?: { url: string } };

function parseChatIds(value: string | undefined): number[] {
  return (value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isSafeInteger(item));
}

function outboundChatIds(chatId: number | undefined): number[] {
  if (chatId) {
    return [chatId];
  }
  const configured = parseChatIds(process.env.TELEGRAM_OUTBOUND_CHAT_IDS);
  if (configured.length > 0) {
    return configured;
  }
  return parseChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactLine(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length <= maxLength ? compacted : `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function htmlLeadField(label: string, value: string | number | null | undefined, maxLength = 120): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return `<i>${escapeHtml(label)}</i>: ${escapeHtml(compactLine(String(value), maxLength))}`;
}

function expandableQuote(title: string, body: string): string {
  const compactBody = body.replace(/\s+/g, " ").trim();
  return `<blockquote expandable><b>${escapeHtml(title)}</b>${compactBody ? ` ${escapeHtml(compactBody)}` : ""}</blockquote>`;
}

function formatMissingFields(fields: string[]): string {
  return fields.length > 0 ? fields.map((field) => `- ${field}`).join("\n") : "No missing fields detected.";
}

function appBaseUrl(): string | null {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "") || null;
}

function leadUrl(lead: { id: string; code?: string | null }): string | null {
  const base = appBaseUrl();
  if (!base) {
    return null;
  }
  return `${base}/leads?leadId=${encodeURIComponent(lead.code?.trim() || lead.id)}`;
}

function absoluteAppUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const base = appBaseUrl();
  if (!base) {
    return value;
  }
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

function telegramCrmButton(url: string): TelegramButton {
  try {
    return new URL(url).protocol === "https:" ? { text: "CRM", web_app: { url } } : { text: "CRM", url };
  } catch {
    return { text: "CRM", url };
  }
}

function projectTypeFromLead(project: string | null, description: string | null): string | null {
  const combined = [project, description].filter(Boolean).join(" ");
  if (!combined) {
    return null;
  }
  const normalized = combined.toLocaleLowerCase();
  if (["efh", "einfamilienhaus", "private house", "haus"].some((token) => normalized.includes(token))) {
    return "EFH Neubau";
  }
  return compactLine(combined, 80);
}

function readNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function documentKindLabel(document: { fileName: string; mimeType?: string | null }): string {
  const fileName = document.fileName.toLocaleLowerCase();
  const mimeType = document.mimeType?.toLocaleLowerCase() ?? "";
  if (fileName.includes("commercial-offer")) {
    const version = fileName.match(/commercial-offer-v(\d+)d?/i);
    return version?.[1] ? `V${version[1]}${/\bv\d+d\b/i.test(document.fileName) ? "d" : ""}` : "offer";
  }
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(fileName)) {
    return "picture";
  }
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return "PDF";
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || /\.(xlsx?|csv|ods)$/i.test(fileName)) {
    return "spreadsheet";
  }
  if (mimeType.includes("word") || /\.(docx?|rtf)$/i.test(fileName)) {
    return "DOC";
  }
  if (mimeType.startsWith("audio/") || /\.(mp3|m4a|ogg|wav|aac|opus)$/i.test(fileName)) {
    return "audio";
  }
  return "document";
}

function documentsQuote(
  documents: Array<{ fileName: string; shortSummary: string; longSummary?: string | null; downloadUrl?: string | null; mimeType?: string | null }>
): string | null {
  if (documents.length === 0) {
    return null;
  }
  const labelCounts = new Map<string, number>();
  const baseLabels = documents.map(documentKindLabel);
  for (const label of baseLabels) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const lines = documents.slice(0, 8).map((document, index) => {
    const baseLabel = baseLabels[index] ?? "document";
    const next = (seen.get(baseLabel) ?? 0) + 1;
    seen.set(baseLabel, next);
    const label = (labelCounts.get(baseLabel) ?? 0) > 1 ? `${baseLabel} ${next}` : baseLabel;
    const downloadUrl = absoluteAppUrl(document.downloadUrl);
    const linkedLabel = downloadUrl
      ? `<a href="${escapeHtml(downloadUrl)}">${escapeHtml(label)}</a>`
      : escapeHtml(label);
    const summary = compactLine(document.shortSummary || document.longSummary || "No summary yet.", 82);
    return `${linkedLabel} - ${escapeHtml(summary)}`;
  });
  const title = `Downloads: ${documents.length} ${documents.length === 1 ? "item" : "items"}`;
  return documents.length === 1 ? `<b>Downloads</b>: ${lines[0]}` : expandableQuote(title, lines.join("; "));
}

async function telegramSendMessage(chatId: number, text: string, buttons: TelegramButton[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined
    })
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram sendMessage failed with ${response.status}`);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, SendToTelegramInput);
    const workspaceId = resolveWorkspaceId(input.workspaceId ?? defaultWorkspaceId);
    const chatIds = outboundChatIds(input.chatId);
    if (chatIds.length === 0) {
      return NextResponse.json({ error: "No Telegram chat is configured for outbound messages." }, { status: 400 });
    }

    const crm = getCrm();
    const [leads, clients, documents, summaries, crmSettings] = await Promise.all([
      crm.listRecords({ entity: "lead", workspaceId, includeArchived: false }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "documentFile", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "leadSummary", workspaceId, includeArchived: true }),
      getCrmRuntimeSettings()
    ]);
    const selected = leads.filter((lead) => input.leadIds.includes(lead.id) || (lead.code && input.leadIds.includes(lead.code)));
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const documentsByLeadId = new Map<string, typeof documents>();
    for (const document of documents) {
      if (!document.leadId || document.archivedAt) {
        continue;
      }
      documentsByLeadId.set(document.leadId, [...(documentsByLeadId.get(document.leadId) ?? []), document]);
    }
    const latestSummaryByLeadId = new Map<string, (typeof summaries)[number]>();
    for (const summary of summaries) {
      if (summary.archivedAt) {
        continue;
      }
      const existing = latestSummaryByLeadId.get(summary.leadId);
      if (!existing || summary.createdAt > existing.createdAt) {
        latestSummaryByLeadId.set(summary.leadId, summary);
      }
    }

    for (const lead of selected) {
      const client = lead.clientId ? clientsById.get(lead.clientId) ?? null : null;
      const project = readNoteField(lead.notes, leadNoteFields.project) ?? lead.company ?? lead.name;
      const area = readNoteField(lead.notes, leadNoteFields.area);
      const description = readNoteField(lead.notes, leadNoteFields.description);
      const todo = readNoteField(lead.notes, leadNoteFields.todo);
      const address = readNoteField(lead.notes, leadNoteFields.address);
      const messenger = lead.whatsapp ?? client?.whatsapp ?? null;
      const budgetEur = readNoteField(lead.notes, leadNoteFields.budgetEur);
      const readiness = evaluateCommercialOfferReadiness(
        {
          clientName: client?.name ?? lead.name,
          projectName: project,
          projectAddress: address,
          projectType: projectTypeFromLead(project, description),
          bgf: readNumber(area),
          manualTotalGross: readNumber(budgetEur)
        },
        crmSettings.commercialOffers.activeFeeTable?.rows ?? []
      );
      const summary = latestSummaryByLeadId.get(lead.id);
      const ref = lead.code?.trim() || lead.id;
      const title = client?.name && client.name !== project ? `${client.name}  ${project}` : project;
      const text = [
        `<b>${escapeHtml(ref)}</b>`,
        `<b>${escapeHtml(compactLine(title, 120))}</b>`,
        htmlLeadField("Area", area, 50),
        htmlLeadField("Description", description, 120),
        htmlLeadField("Todo", todo, 80),
        htmlLeadField("Address", address, 80),
        htmlLeadField("Messenger", messenger, 70),
        expandableQuote("Missing for offer", formatMissingFields(readiness.missingFields)),
        documentsQuote(documentsByLeadId.get(lead.id) ?? []),
        summary?.shortSummary ? expandableQuote("Summary", compactLine(summary.shortSummary, 220)) : null
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
      const url = leadUrl(lead);
      const buttons = url ? [telegramCrmButton(url)] : [];
      for (const chatId of chatIds) {
        await telegramSendMessage(chatId, text, buttons);
      }
    }

    return NextResponse.json({ sent: selected.length, chatIds: chatIds.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
