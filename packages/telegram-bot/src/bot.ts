import { config } from "dotenv";
import type { IngestLeadIntakeInput, LeadIntakeAttachmentInput, UpsertClientInput, UpsertLeadInput } from "@lightcrm/core";
import type { CrmOrchestrationInput, CrmOrchestrationResult } from "@lightcrm/orchestrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleTelegramUpdate,
  parseAllowedChatIds,
  type TelegramArchiveLeadInput,
  type TelegramCalendarEventInput,
  type TelegramCalendarEventResult,
  type PrepareTelegramAttachmentInput,
  type TelegramGeneratedDocument,
  type TelegramLeadDocument,
  type TelegramLeadDocumentsInput,
  type TelegramLeadDocumentsResult,
  type TelegramRecentLeadsInput,
  type TelegramLeadSearchInput,
  type TelegramLeadSearchResult,
  type TelegramLeadUpdateInput,
  type TelegramUndoLeadIntakeInput,
  type TelegramUndoLeadIntakeResult,
  type PendingClarification,
  type PendingAttachmentDecision,
  type TakePendingClarificationInput,
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
import { analyzeTelegramAttachment } from "./attachment-analysis";

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
const pendingNewLeadTtlMs = Number(process.env.TELEGRAM_PENDING_NEW_LEAD_TTL_MS ?? 10 * 60 * 1000);
const pendingAttachmentDecisionTtlMs = Number(
  process.env.TELEGRAM_PENDING_ATTACHMENT_DECISION_TTL_MS ?? 10 * 60 * 1000
);
const pendingClarificationTtlMs = Number(process.env.TELEGRAM_PENDING_CLARIFICATION_TTL_MS ?? 15 * 60 * 1000);
const crmAppBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? crmApiBase;
const attachmentAnalysisModelFallback = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const attachmentAudioModel = process.env.OPENAI_AUDIO_MODEL ?? "whisper-1";
const serverErrorReply = "server error, developer notified";

type LangGraphSettingsResponse = {
  settings?: {
    model?: string;
    tgIntakePolicy?: {
      analyzeAttachmentsBeforeAction?: boolean;
    };
  };
};

let attachmentAnalysisSettingsCache:
  | { expiresAt: number; value: { enabled: boolean; model: string } }
  | null = null;

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

async function crmGet<T>(path: string): Promise<T> {
  const response = await fetch(crmApiUrl(path));
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(typeof payload?.error === "string" ? payload.error : `LightCrm API ${path} failed`);
    (error as Error & { payload?: unknown }).payload = payload;
    throw error;
  }
  return payload as T;
}

async function getAttachmentAnalysisSettings(): Promise<{ enabled: boolean; model: string }> {
  const now = Date.now();
  if (attachmentAnalysisSettingsCache && attachmentAnalysisSettingsCache.expiresAt > now) {
    return attachmentAnalysisSettingsCache.value;
  }
  try {
    const payload = await crmGet<LangGraphSettingsResponse>("/api/crm/orchestrator/settings");
    const value = {
      enabled: payload.settings?.tgIntakePolicy?.analyzeAttachmentsBeforeAction !== false,
      model: payload.settings?.model?.trim() || attachmentAnalysisModelFallback
    };
    attachmentAnalysisSettingsCache = { expiresAt: now + 60_000, value };
    return value;
  } catch (error) {
    console.warn("Failed to read attachment analysis settings; using safe defaults", error);
    return { enabled: true, model: attachmentAnalysisModelFallback };
  }
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
  name: string;
  status?: string | null;
  client?: { name?: string | null } | null;
  project?: string | null;
  projectName?: string | null;
  area?: string | null;
  description?: string | null;
  interest?: string | null;
  urgency?: string | null;
  todo?: string | null;
  address?: string | null;
  messenger?: string | null;
  summaryShort?: string | null;
  summaryLong?: string | null;
  summaryUpdatedAt?: string | null;
  documents?: TelegramLeadDocument[];
};

async function listRecentLeads(input: TelegramRecentLeadsInput): Promise<TelegramLeadSearchResult> {
  const url = new URL(crmApiUrl("/api/crm/leads"));
  url.searchParams.set("workspaceId", input.workspaceId);
  const response = await fetch(url);
  const payload = (await response.json()) as CrmLeadWithDocuments[] | { error?: string };
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(!Array.isArray(payload) && payload.error ? payload.error : "LightCrm API /api/crm/leads failed");
  }
  return {
    matches: payload.slice(0, input.limit ?? 6).map((lead) => ({
      id: lead.id,
      code: lead.code ?? null,
      name: lead.name,
      status:
        lead.status === "contacted" ||
        lead.status === "qualified" ||
        lead.status === "lost" ||
        lead.status === "converted" ||
        lead.status === "archived"
          ? lead.status
          : "new",
      clientName: lead.client?.name ?? lead.name,
      project: lead.project ?? lead.projectName ?? lead.name,
      area: lead.area ?? null,
      description: lead.description ?? null,
      interest: lead.interest ?? null,
      urgency: lead.urgency ?? null,
      todo: lead.todo ?? null,
      address: lead.address ?? null,
      messenger: lead.messenger ?? null,
      summaryShort: lead.summaryShort ?? null,
      summaryLong: lead.summaryLong ?? null,
      summaryUpdatedAt: lead.summaryUpdatedAt ?? null,
      score: 1
    }))
  };
}

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
    .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
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

async function createCalendarEvent(input: TelegramCalendarEventInput): Promise<TelegramCalendarEventResult> {
  return crmCall<TelegramCalendarEventResult>("/api/crm/calendar-events/upsert", input);
}

async function archiveLead(input: TelegramArchiveLeadInput) {
  return crmCall("/api/crm/archive", {
    workspaceId: input.workspaceId,
    entity: "lead",
    ids: [input.leadId]
  });
}

async function undoLeadIntake(input: TelegramUndoLeadIntakeInput): Promise<TelegramUndoLeadIntakeResult> {
  return crmCall<TelegramUndoLeadIntakeResult>("/api/crm/lead-intake/undo", input);
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
  offerVersion?: number;
  readiness?: {
    missingFields?: string[];
    priceMissingFields?: string[];
    documentMissingFields?: string[];
    pricingMode?: "auto" | "manual";
    values?: {
      totalGross?: number | null;
    };
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
    caption: formatOfferDocumentCaption(payload.offerVersion, payload.readiness),
    offerVersion: payload.offerVersion ?? null,
    offerMissingFields: payload.readiness?.missingFields ?? [],
    offerTotalGross: payload.readiness?.values?.totalGross ?? null
  };
}

function formatOfferCurrency(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("de-DE", { maximumFractionDigits: 0 })
    : null;
}

function humanOfferFieldName(value: string): string {
  const labels: Record<string, string> = {
    bgf: "project area / BGF",
    bgf_or_manual_total_gross: "project area / BGF or manual gross price",
    project_type_or_manual_total_gross: "project type or manual gross price",
    manual_total_gross: "manual gross price",
    project_name: "lead name",
    project_address: "project address",
    client_name: "client name"
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function formatOfferDocumentCaption(version: number | undefined, readiness: GenerateOfferResponse["readiness"]): string {
  const total = formatOfferCurrency(readiness?.values?.totalGross);
  const missingFields =
    (readiness?.documentMissingFields ?? readiness?.missingFields ?? []).map(humanOfferFieldName).filter(Boolean);
  const mode = readiness?.pricingMode ? ` (${readiness.pricingMode})` : "";
  const title = `commercial offer${version ? ` V${version}d draft` : ""} ready${total ? `: ${total} EUR gross${mode}` : ""}`;
  if (missingFields.length === 0) {
    return `${title}\nAll key offer fields are filled.`;
  }
  return [
    title,
    `Please add before sending: ${missingFields.join(", ")}.`
  ].join("\n");
}

async function prepareAttachment(input: PrepareTelegramAttachmentInput): Promise<LeadIntakeAttachmentInput> {
  const fileInfo = await getFile(input.attachment.fileId);
  const bytes = await downloadTelegramFile(fileInfo.file_path);
  const analysisSettings = await getAttachmentAnalysisSettings();
  const analysis =
    analysisSettings.enabled && process.env.OPENAI_API_KEY
      ? await analyzeTelegramAttachment({
          attachment: input.attachment,
          bytes,
          text: input.text ?? input.message.caption ?? input.message.text ?? "",
          author: input.author ?? null,
          apiKey: process.env.OPENAI_API_KEY,
          model: analysisSettings.model,
          audioModel: attachmentAudioModel,
          fetchImpl: fetch
        }).catch((error) => {
          console.warn("TG attachment semantic analysis failed", {
            messageId: input.message.message_id,
            fileName: input.attachment.fileName,
            error
          });
          return null;
        })
      : null;
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
    summary: analysis?.summary ?? null,
    longSummary: analysis?.longSummary ?? null,
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

async function registerBotCommands() {
  await telegramCall("setMyCommands", {
    commands: [
      { command: "crm", description: "Open CRM" },
      { command: "search", description: "Show recent leads" },
      { command: "newlead", description: "Start a new lead intake" },
      { command: "help", description: "How to use LightCrm" }
    ]
  });
}

async function runPolling() {
  console.log(`LightCrm TG bot polling started. Allowed chats: ${allowedChatIds.size || "all"}.`);
  try {
    await registerBotCommands();
  } catch (error) {
    console.warn("Failed to register TG bot commands", error);
  }
  let offset: number | undefined;
  const mediaGroups = new Map<string, MediaGroupBuffer>();
  const chatIntakes = new Map<string, ChatIntakeBuffer>();
  const activeLeads = new Map<string, { lead: { id: string; name: string }; updatedAt: number }>();
  const pendingNewLeadChats = new Map<string, { createdAt: number }>();
  const pendingAttachmentDecisions = new Map<string, PendingAttachmentDecision & { createdAt: number }>();
  const pendingClarifications = new Map<string, PendingClarification & { id: string; createdAt: number }>();
  let pendingAttachmentDecisionCounter = 0;
  let pendingClarificationCounter = 0;
  const cleanupPendingAttachmentDecisions = (now: number) => {
    for (const [id, pending] of pendingAttachmentDecisions) {
      if (now - pending.createdAt > pendingAttachmentDecisionTtlMs) {
        pendingAttachmentDecisions.delete(id);
      }
    }
  };
  const cleanupPendingNewLeads = (now: number) => {
    for (const [chatId, pending] of pendingNewLeadChats) {
      if (now - pending.createdAt > pendingNewLeadTtlMs) {
        pendingNewLeadChats.delete(chatId);
      }
    }
  };
  const cleanupPendingClarifications = (now: number) => {
    for (const [id, pending] of pendingClarifications) {
      if (now - pending.createdAt > pendingClarificationTtlMs) {
        pendingClarifications.delete(id);
      }
    }
  };
  const startNewLeadMode = (chatId: number) => {
    const key = String(chatId);
    activeLeads.delete(key);
    pendingNewLeadChats.set(key, { createdAt: Date.now() });
  };
  const takePendingNewLeadMode = (chatId: number, now = Date.now()) => {
    cleanupPendingNewLeads(now);
    const key = String(chatId);
    const pending = pendingNewLeadChats.get(key);
    if (!pending) {
      return false;
    }
    pendingNewLeadChats.delete(key);
    return now - pending.createdAt <= pendingNewLeadTtlMs;
  };
  const createPendingAttachmentDecision = (input: PendingAttachmentDecision) => {
    cleanupPendingAttachmentDecisions(Date.now());
    pendingAttachmentDecisionCounter += 1;
    const id = `${Date.now().toString(36)}${pendingAttachmentDecisionCounter.toString(36)}`;
    pendingAttachmentDecisions.set(id, { ...input, createdAt: Date.now() });
    return id;
  };
  const takePendingAttachmentDecision = (id: string) => {
    const pending = pendingAttachmentDecisions.get(id);
    pendingAttachmentDecisions.delete(id);
    if (!pending || Date.now() - pending.createdAt > pendingAttachmentDecisionTtlMs) {
      return null;
    }
    return {
      message: pending.message,
      activeLead: pending.activeLead
    };
  };
  const createPendingClarification = (input: PendingClarification) => {
    cleanupPendingClarifications(Date.now());
    pendingClarificationCounter += 1;
    const id = `${Date.now().toString(36)}c${pendingClarificationCounter.toString(36)}`;
    pendingClarifications.set(id, { ...input, id, createdAt: Date.now() });
    return id;
  };
  const takePendingClarification = (input: TakePendingClarificationInput) => {
    cleanupPendingClarifications(Date.now());
    const entries = [...pendingClarifications.entries()].filter(([, pending]) => pending.chatId === input.chatId);
    const matchByReply = input.replyToMessageId
      ? entries.find(([, pending]) => pending.promptMessageId === input.replyToMessageId)
      : null;
    const match = matchByReply ?? entries.sort((left, right) => right[1].createdAt - left[1].createdAt)[0] ?? null;
    if (!match) {
      return null;
    }
    pendingClarifications.delete(match[0]);
    const pending = match[1];
    return {
      chatId: pending.chatId,
      promptMessageId: pending.promptMessageId,
      message: pending.message,
      orchestrationText: pending.orchestrationText,
      result: pending.result,
      kind: pending.kind
    };
  };
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
      cleanupPendingAttachmentDecisions(now);
      cleanupPendingNewLeads(now);
      cleanupPendingClarifications(now);
      const nextOffset =
        updates.length > 0 ? Math.max(...updates.map((update) => update.update_id)) + 1 : offset;
      const mediaReady = collectReadyMediaGroupUpdates(updates, mediaGroups, mediaGroupFlushMs, now);
      const intakeReady = collectReadyChatIntakeUpdates(mediaReady, chatIntakes, chatIntakeFlushMs, now);
      for (const update of intakeReady) {
        const message = update.message;
        const callbackChatId = update.callback_query?.message?.chat.id;
        console.log("TG update ready", updateLogContext(update));
        const forceCreateNewLead = message ? takePendingNewLeadMode(message.chat.id, now) : false;
        const active = message && !forceCreateNewLead ? activeLeads.get(String(message.chat.id)) : null;
        const activeLead =
          active && now - active.updatedAt <= activeLeadTtlMs ? active.lead : null;
        try {
          const lead = await handleTelegramUpdate(update, {
            allowedChatIds,
            workspaceId,
            crmAppBaseUrl,
            activeLead,
            forceCreateNewLead,
            sendMessage,
            orchestrate,
            createClient,
            createLead,
            searchLeads,
            listRecentLeads,
            updateLead,
            createReminder,
            createCalendarEvent,
            ingestLeadIntake,
            prepareAttachment,
            listLeadDocuments,
            sendDocument,
            generateOffer,
            archiveLead,
            undoLeadIntake,
            startNewLeadMode,
            createPendingAttachmentDecision,
            takePendingAttachmentDecision,
            createPendingClarification,
            takePendingClarification
          });
          if (update.callback_query?.data?.startsWith("undo_lead:") && callbackChatId) {
            activeLeads.delete(String(callbackChatId));
          }
          const leadChatId = message?.chat.id ?? callbackChatId ?? null;
          if (lead && leadChatId) {
            activeLeads.set(String(leadChatId), { lead, updatedAt: now });
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
