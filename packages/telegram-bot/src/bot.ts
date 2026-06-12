import { config } from "dotenv";
import type { IngestLeadIntakeInput, LeadIntakeAttachmentInput, UpsertClientInput, UpsertLeadInput } from "@lightcrm/core";
import type { CrmOrchestrationInput, CrmOrchestrationResult } from "@lightcrm/orchestrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleTelegramUpdate,
  parseAllowedChatIds,
  type TelegramArchiveLeadInput,
  type PrepareTelegramAttachmentInput,
  type TelegramGeneratedDocument,
  type TelegramLeadDocument,
  type TelegramLeadDocumentsInput,
  type TelegramLeadDocumentsResult,
  type TelegramLeadSearchInput,
  type TelegramLeadSearchResult,
  type TelegramLeadUpdateInput,
  type TelegramReminderInput,
  type TelegramReminderResult,
  type TelegramSendMessageOptions,
  type TelegramUpdate,
  uploadTelegramAttachmentToWeb
} from "./bot-core";
import {
  collectReadyChatIntakeUpdates,
  collectReadyMediaGroupUpdates,
  type ChatIntakeBuffer,
  type MediaGroupBuffer
} from "./media-groups";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(repoRoot, ".env") });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const apiBase = `https://api.telegram.org/bot${token}`;
const telegramFileBase = `https://api.telegram.org/file/bot${token}`;
const crmApiBase = process.env.LIGHTCRM_API_BASE ?? "http://localhost:4900";
const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";
const pollIntervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 2500);
const mediaGroupFlushMs = 1400;
const chatIntakeFlushMs = Number(process.env.TELEGRAM_INTAKE_FLUSH_MS ?? 3500);
const activeLeadTtlMs = Number(process.env.TELEGRAM_ACTIVE_LEAD_TTL_MS ?? 30 * 60 * 1000);
const crmAppBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? crmApiBase;
const serverErrorReply = "server error, developer notified";

function updateLogContext(update: TelegramUpdate) {
  const message = update.message;
  const callback = update.callback_query;
  return {
    updateId: update.update_id,
    kind: message ? "message" : callback ? "callback_query" : "unknown",
    chatId: message?.chat.id ?? callback?.message?.chat.id ?? null,
    messageId: message?.message_id ?? callback?.message?.message_id ?? null,
    callbackData: callback?.data?.split(":")[0] ?? null,
    hasText: Boolean(message?.text?.trim() || message?.caption?.trim()),
    hasAttachments: Boolean(message?.document || message?.voice || message?.audio || message?.photo?.length || message?.groupedAttachments?.length),
    mediaGroupId: message?.media_group_id ?? null
  };
}

function crmApiUrl(path: string): string {
  return `${crmApiBase.replace(/\/$/, "")}${path}`;
}

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `TG ${method} failed`);
  }
  return payload.result as T;
}

async function telegramFormCall<T>(method: string, form: FormData): Promise<T> {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    body: form
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `TG ${method} failed`);
  }
  return payload.result as T;
}

async function crmCall<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(crmApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `LightCrm API ${path} failed`);
  }
  return payload as T;
}

async function sendMessage(chatId: number, text: string, options?: TelegramSendMessageOptions) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(text.includes("<b>") ? { parse_mode: "HTML" } : {}),
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {})
  });
}

async function sendDocument(chatId: number, document: TelegramGeneratedDocument) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (document.caption) {
    form.set("caption", document.caption);
  }
  form.set(
    "document",
    new Blob([Buffer.from(document.bytes)], {
      type: document.mimeType ?? "application/octet-stream"
    }),
    document.fileName
  );
  return telegramFormCall("sendDocument", form);
}

async function getUpdates(offset: number | undefined): Promise<TelegramUpdate[]> {
  return telegramCall("getUpdates", {
    offset,
    timeout: Math.max(1, Math.ceil(pollIntervalMs / 1000)),
    allowed_updates: ["message", "callback_query"]
  });
}

type TelegramFileInfo = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path: string;
};

async function getFile(fileId: string): Promise<TelegramFileInfo> {
  return telegramCall("getFile", { file_id: fileId });
}

async function downloadTelegramFile(filePath: string): Promise<Uint8Array> {
  const response = await fetch(`${telegramFileBase}/${filePath}`);
  if (!response.ok) {
    throw new Error(`TG file download failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function createLead(input: UpsertLeadInput) {
  return crmCall<{ id: string; name: string }>("/api/crm/leads/upsert", input);
}

async function updateLead(input: TelegramLeadUpdateInput) {
  const payload = await crmCall<{ lead: { id: string; name: string } }>("/api/crm/leads/update", input);
  return payload.lead;
}

async function searchLeads(input: TelegramLeadSearchInput): Promise<TelegramLeadSearchResult> {
  return crmCall<TelegramLeadSearchResult>("/api/crm/leads/search", input);
}

type CrmLeadWithDocuments = {
  id: string;
  code?: string | null;
  documents?: TelegramLeadDocument[];
};

function publicCrmUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `${crmAppBaseUrl.replace(/\/$/, "")}${value.startsWith("/") ? value : `/${value}`}`;
}

async function listLeadDocuments(input: TelegramLeadDocumentsInput): Promise<TelegramLeadDocumentsResult> {
  const url = new URL(crmApiUrl("/api/crm/leads"));
  url.searchParams.set("workspaceId", input.workspaceId);
  const response = await fetch(url);
  const payload = (await response.json()) as CrmLeadWithDocuments[] | { error?: string };
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(!Array.isArray(payload) && payload.error ? payload.error : "LightCrm API /api/crm/leads failed");
  }
  const lead = payload.find((item) => item.id === input.leadId || item.code === input.leadId);
  const documents = (lead?.documents ?? [])
    .slice()
    .sort((left, right) => new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime())
    .slice(0, input.limit ?? 8)
    .map((document) => ({
      ...document,
      downloadUrl: document.downloadUrl ? publicCrmUrl(document.downloadUrl) : null
    }));
  return { leadId: lead?.id ?? input.leadId, documents };
}

async function createReminder(input: TelegramReminderInput): Promise<TelegramReminderResult> {
  return crmCall<TelegramReminderResult>("/api/crm/reminders/upsert", input);
}

async function archiveLead(input: TelegramArchiveLeadInput) {
  return crmCall("/api/crm/archive", {
    workspaceId: input.workspaceId,
    entity: "lead",
    ids: [input.leadId]
  });
}

async function createClient(input: UpsertClientInput) {
  return crmCall<{ id: string; name: string }>("/api/crm/clients/upsert", input);
}

async function ingestLeadIntake(input: IngestLeadIntakeInput) {
  return crmCall<{ documents?: unknown[]; summary?: string }>("/api/crm/lead-intake", input);
}

async function orchestrate(input: CrmOrchestrationInput) {
  return crmCall<CrmOrchestrationResult>("/api/crm/orchestrator/dry-run", input);
}

type GenerateOfferResponse = {
  document?: {
    fileName?: string;
    downloadUrl?: string | null;
    mimeType?: string | null;
  };
};

function absoluteCrmUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return crmApiUrl(value.startsWith("/") ? value : `/${value}`);
}

async function generateOffer(leadId: string): Promise<TelegramGeneratedDocument> {
  const payload = await crmCall<GenerateOfferResponse>("/api/crm/leads/generate-offer", {
    workspaceId,
    leadId
  });
  const document = payload.document;
  if (!document?.downloadUrl) {
    throw new Error("Commercial offer generation did not return a download URL");
  }
  const response = await fetch(absoluteCrmUrl(document.downloadUrl));
  if (!response.ok) {
    throw new Error(`Commercial offer download failed: ${response.status}`);
  }
  return {
    fileName: document.fileName ?? `${leadId}-commercial-offer.docx`,
    mimeType:
      document.mimeType ??
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: new Uint8Array(await response.arrayBuffer()),
    caption: "commercial offer ready"
  };
}

async function prepareAttachment(input: PrepareTelegramAttachmentInput): Promise<LeadIntakeAttachmentInput> {
  const fileInfo = await getFile(input.attachment.fileId);
  const bytes = await downloadTelegramFile(fileInfo.file_path);
  return uploadTelegramAttachmentToWeb({
    crmApiBase,
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    sourceChannel: "telegram",
    sourceThreadId: String(input.message.chat.id),
    sourceMessageId: String(input.message.message_id),
    text: input.text ?? input.message.caption ?? input.message.text ?? "",
    author: input.author ?? null,
    attachment: input.attachment,
    bytes,
    fetchImpl: fetch
  });
}

async function notifyServerError(chatId: number) {
  try {
    await sendMessage(chatId, serverErrorReply);
  } catch (error) {
    console.error("Failed to send TG server error notice", error);
  }
}

async function runPolling() {
  console.log(`LightCrm TG bot polling started. Allowed chats: ${allowedChatIds.size || "all"}.`);
  let offset: number | undefined;
  const mediaGroups = new Map<string, MediaGroupBuffer>();
  const chatIntakes = new Map<string, ChatIntakeBuffer>();
  const activeLeads = new Map<string, { lead: { id: string; name: string }; updatedAt: number }>();
  for (;;) {
    try {
      const updates = await getUpdates(offset);
      if (updates.length > 0) {
        console.log("TG updates received", {
          count: updates.length,
          firstUpdateId: updates[0]?.update_id,
          lastUpdateId: updates[updates.length - 1]?.update_id
        });
      }
      const now = Date.now();
      const nextOffset =
        updates.length > 0 ? Math.max(...updates.map((update) => update.update_id)) + 1 : offset;
      const mediaReady = collectReadyMediaGroupUpdates(updates, mediaGroups, mediaGroupFlushMs, now);
      const intakeReady = collectReadyChatIntakeUpdates(mediaReady, chatIntakes, chatIntakeFlushMs, now);
      for (const update of intakeReady) {
        const message = update.message;
        const callbackChatId = update.callback_query?.message?.chat.id;
        console.log("TG update ready", updateLogContext(update));
        const active = message ? activeLeads.get(String(message.chat.id)) : null;
        const activeLead =
          active && now - active.updatedAt <= activeLeadTtlMs ? active.lead : null;
        try {
          const lead = await handleTelegramUpdate(update, {
            allowedChatIds,
            workspaceId,
            crmAppBaseUrl,
            activeLead,
            sendMessage,
            orchestrate,
            createClient,
            createLead,
            searchLeads,
            updateLead,
            createReminder,
            ingestLeadIntake,
            prepareAttachment,
            listLeadDocuments,
            sendDocument,
            generateOffer,
            archiveLead
          });
          if (update.callback_query?.data?.startsWith("undo_lead:") && callbackChatId) {
            activeLeads.delete(String(callbackChatId));
          }
          if (lead && message) {
            activeLeads.set(String(message.chat.id), { lead, updatedAt: now });
          }
          console.log("TG update handled", {
            ...updateLogContext(update),
            leadId: lead?.id ?? null
          });
        } catch (error) {
          console.error("TG update failed", {
            updateId: update.update_id,
            chatId: message?.chat.id,
            messageId: message?.message_id,
            error
          });
          if (message?.chat.id ?? callbackChatId) {
            await notifyServerError(message?.chat.id ?? callbackChatId!);
          }
        }
      }
      offset = nextOffset;
    } catch (error) {
      console.error(error);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

runPolling().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
