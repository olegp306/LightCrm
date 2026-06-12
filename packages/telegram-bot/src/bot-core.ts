import type {
  Client,
  IngestLeadIntakeInput,
  Lead,
  LeadIntakeAttachmentInput,
  UpsertClientInput,
  UpsertLeadInput
} from "@lightcrm/core";
import {
  DEFAULT_LANGGRAPH_SETTINGS,
  runCrmOrchestration,
  type CrmOrchestrationInput,
  type CrmOrchestrationResult
} from "@lightcrm/orchestrator";
import { createHash } from "node:crypto";

export type TelegramUser = {
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  media_group_id?: string;
  chat: { id: number };
  from?: TelegramUser;
  forward_origin?: TelegramForwardOrigin;
  forward_from?: TelegramUser;
  forward_sender_name?: string;
  forward_date?: number;
  document?: TelegramFile;
  voice?: TelegramFile;
  audio?: TelegramFile;
  photo?: TelegramPhotoSize[];
  groupedAttachments?: TelegramAttachment[];
  reply_to_message?: TelegramReplyMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: {
    chat: { id: number };
    message_id: number;
  };
  from?: TelegramUser;
};

export type TelegramForwardOrigin = {
  type?: string;
  sender_user?: TelegramUser;
  sender_user_name?: string;
  chat?: { id: number; title?: string; username?: string; type?: string };
  date?: number;
};

export type TelegramReplyMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  reply_markup?: {
    inline_keyboard?: Array<Array<{ text?: string; url?: string; callback_data?: string; web_app?: { url: string } }>>;
  };
};

export type TelegramFile = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  width: number;
  height: number;
};

export type TelegramAttachment = {
  fileId: string;
  uniqueId: string | null;
  kind: LeadIntakeAttachmentInput["kind"];
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type PrepareTelegramAttachmentInput = {
  workspaceId: string;
  leadId: string;
  attachment: TelegramAttachment;
  message: TelegramMessage;
  text?: string;
  author?: string | null;
};

export type UploadTelegramAttachmentToWebInput = {
  crmApiBase: string;
  workspaceId: string;
  leadId: string;
  sourceChannel: string;
  sourceThreadId: string;
  sourceMessageId: string;
  text: string;
  author: string | null;
  attachment: TelegramAttachment;
  bytes: Uint8Array;
  fetchImpl?: typeof fetch;
};

export type TelegramBotDeps = {
  allowedChatIds: Set<number>;
  workspaceId: string;
  crmAppBaseUrl?: string;
  activeLead?: Pick<Lead, "id" | "name"> | null;
  sendMessage: (chatId: number, text: string, options?: TelegramSendMessageOptions) => Promise<unknown> | unknown;
  sendDocument?: (chatId: number, document: TelegramGeneratedDocument) => Promise<unknown> | unknown;
  generateOffer?: (leadId: string) => Promise<TelegramGeneratedDocument>;
  orchestrate?: (input: CrmOrchestrationInput) => Promise<CrmOrchestrationResult>;
  createClient?: (input: UpsertClientInput) => Promise<Pick<Client, "id" | "name">>;
  createLead?: (input: UpsertLeadInput) => Promise<Pick<Lead, "id" | "name">>;
  searchLeads?: (input: TelegramLeadSearchInput) => Promise<TelegramLeadSearchResult>;
  updateLead?: (input: TelegramLeadUpdateInput) => Promise<Pick<Lead, "id" | "name">>;
  createReminder?: (input: TelegramReminderInput) => Promise<TelegramReminderResult>;
  ingestLeadIntake?: (input: IngestLeadIntakeInput) => Promise<{ documents?: unknown[]; summary?: string }>;
  prepareAttachment?: (input: PrepareTelegramAttachmentInput) => Promise<LeadIntakeAttachmentInput>;
  listLeadDocuments?: (input: TelegramLeadDocumentsInput) => Promise<TelegramLeadDocumentsResult>;
  archiveLead?: (input: TelegramArchiveLeadInput) => Promise<unknown>;
};

export type TelegramLeadSearchInput = {
  workspaceId: string;
  query: string;
  limit?: number;
};

export type TelegramLeadSearchResult = {
  matches: Array<
    Pick<Lead, "id" | "name" | "status" | "code"> & {
      score: number;
      clientName?: string | null;
      project?: string | null;
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
    }
  >;
};

export type TelegramLeadDocument = {
  id: string;
  fileName: string;
  shortSummary: string;
  longSummary?: string | null;
  downloadUrl?: string | null;
  mimeType?: string | null;
  createdAt?: string | Date | null;
};

export type TelegramLeadDocumentsInput = {
  workspaceId: string;
  leadId: string;
  limit?: number;
};

export type TelegramLeadDocumentsResult = {
  leadId: string;
  documents: TelegramLeadDocument[];
};

export type TelegramLeadUpdateInput = {
  workspaceId: string;
  leadId: string;
  patch: Partial<Pick<UpsertLeadInput, "name" | "phone" | "company" | "notes">>;
  source?: {
    channel?: string | null;
    messageId?: string | null;
  };
};

export type TelegramReminderInput = {
  workspaceId: string;
  leadId?: string | null;
  title: string;
  description?: string | null;
  dueAt: string;
  sourceChannel?: string | null;
};

export type TelegramReminderResult = {
  id: string;
  title: string;
  dueAt: string | Date;
};

export type TelegramArchiveLeadInput = {
  workspaceId: string;
  leadId: string;
};

export type TelegramGeneratedDocument = {
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
  caption?: string;
};

export type TelegramSendMessageOptions = {
  replyMarkup?: {
    inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string; web_app?: { url: string } }>>;
  };
};

export function parseAllowedChatIds(value: string | undefined): Set<number> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number(part))
      .filter((id) => Number.isSafeInteger(id))
  );
}

function authorName(user: TelegramUser | undefined): string | null {
  if (!user) {
    return null;
  }
  if (user.username) {
    return user.username;
  }
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
}

function shortValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }
  return String(value);
}

function semanticReplyHeader(result: CrmOrchestrationResult, status: "preview" | "executed"): string {
  const actionTypes = result.actions.map((action) => action.type);
  if (status === "executed") {
    return "[+] done";
  }
  if (actionTypes.length === 0 || result.intent === "no_action") {
    return "[?] not sure";
  }
  if (actionTypes.includes("request_review") || result.risk === "review") {
    return "[!] needs review";
  }
  if (actionTypes.includes("create_lead")) {
    return "[+] lead ready";
  }
  if (actionTypes.includes("update_lead")) {
    return "[~] lead update";
  }
  return "[>] plan";
}

export function formatOrchestrationReply(
  result: CrmOrchestrationResult,
  options: { status?: "preview" | "executed" } = {}
): string {
  const action = result.actions[0];
  const actionLabel = result.actions.length > 0 ? result.actions.map((item) => item.type).join(" + ") : "none";
  const payload = action?.payload && typeof action.payload === "object" ? action.payload : null;
  const targetId = payload && "targetId" in payload ? payload.targetId : null;
  const status = options.status ?? "preview";
  const lines = [
    semanticReplyHeader(result, status),
    `intent: ${result.intent}`,
    `action: ${actionLabel}`,
    `risk: ${result.risk}`,
    targetId ? `Target: ${String(targetId)}` : null,
    result.facts.contactName ? `contact: ${shortValue(result.facts.contactName)}` : null,
    result.facts.projectName || result.facts.projectType
      ? `project: ${shortValue(result.facts.projectName ?? result.facts.projectType)}`
      : null,
    result.facts.location ? `location: ${shortValue(result.facts.location)}` : null,
    result.facts.dueAt ? `due: ${shortValue(result.facts.dueAt)}` : null,
    action?.reason ? `reason: ${action.reason}` : null,
    result.explanations[0] ? `note: ${result.explanations[0]}` : null,
    `evidence: ${shortValue(result.facts.evidence.sourceMessageId)}`
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n").slice(0, 3900);
}

function helpText(): string {
  return [
    "LightCrm bot is running.",
    "Send a lead/update/reminder message and I will return a LangGraph plan or execution result.",
    "Current mode: auto-safe lead/client writes are enabled; review-risk actions stay as previews."
  ].join("\n");
}

function forwardedSource(message: TelegramMessage): string | null {
  const origin = message.forward_origin;
  const sender =
    origin?.sender_user_name ??
    origin?.sender_user?.username ??
    [origin?.sender_user?.first_name, origin?.sender_user?.last_name].filter(Boolean).join(" ") ??
    origin?.chat?.title ??
    origin?.chat?.username ??
    message.forward_sender_name ??
    message.forward_from?.username ??
    [message.forward_from?.first_name, message.forward_from?.last_name].filter(Boolean).join(" ");
  const source = sender || origin?.type || (message.forward_date ? "forwarded message" : "");
  return source ? source : null;
}

function buildOrchestrationText(message: TelegramMessage, text: string, attachments: TelegramAttachment[]): string {
  const source = forwardedSource(message);
  const attachmentSummary = attachments.map((attachment) => `${attachment.kind}: ${attachment.fileName}`).join("; ");
  if (!source) {
    return text;
  }
  return [
    text.trim() ? `Director instruction: ${text.trim()}` : "Director instruction: not provided.",
    `Forwarded context source: ${source}.`,
    attachmentSummary ? `Forwarded attachments: ${attachmentSummary}.` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function pickPhoto(message: TelegramMessage): TelegramPhotoSize | null {
  return [...(message.photo ?? [])].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

export function extractTelegramAttachments(message: TelegramMessage): TelegramAttachment[] {
  if (message.groupedAttachments) {
    return message.groupedAttachments;
  }
  const attachments: TelegramAttachment[] = [];
  if (message.document) {
    attachments.push({
      fileId: message.document.file_id,
      uniqueId: message.document.file_unique_id ?? null,
      kind: message.document.mime_type === "application/pdf" ? "pdf" : "document",
      fileName: message.document.file_name ?? `TG-document-${message.message_id}`,
      mimeType: message.document.mime_type ?? null,
      sizeBytes: message.document.file_size ?? null
    });
  }
  if (message.voice) {
    attachments.push({
      fileId: message.voice.file_id,
      uniqueId: message.voice.file_unique_id ?? null,
      kind: "voice",
      fileName: message.voice.file_name ?? `TG-voice-${message.message_id}.ogg`,
      mimeType: message.voice.mime_type ?? "audio/ogg",
      sizeBytes: message.voice.file_size ?? null
    });
  }
  if (message.audio) {
    attachments.push({
      fileId: message.audio.file_id,
      uniqueId: message.audio.file_unique_id ?? null,
      kind: "audio",
      fileName: message.audio.file_name ?? `TG-audio-${message.message_id}`,
      mimeType: message.audio.mime_type ?? null,
      sizeBytes: message.audio.file_size ?? null
    });
  }
  const photo = pickPhoto(message);
  if (photo) {
    attachments.push({
      fileId: photo.file_id,
      uniqueId: photo.file_unique_id ?? null,
      kind: "image",
      fileName: `TG-photo-${message.message_id}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: photo.file_size ?? null
    });
  }
  return attachments;
}

function actionPayload(result: CrmOrchestrationResult, action = result.actions[0]): Record<string, unknown> {
  const payload = action?.payload;
  return payload && typeof payload === "object" ? payload : {};
}

function actionOfType(result: CrmOrchestrationResult, type: CrmOrchestrationResult["actions"][number]["type"]) {
  return result.actions.find((action) => action.type === type);
}

function hasAutoAction(result: CrmOrchestrationResult, type: CrmOrchestrationResult["actions"][number]["type"]) {
  return result.actions.some((action) => action.type === type && action.risk === "auto");
}

function stableTelegramClientId(workspaceId: string, contactName: string): string {
  const normalized = contactName.trim().toLocaleLowerCase();
  const digest = createHash("sha1").update(`${workspaceId}:${normalized}`).digest("hex").slice(0, 16);
  return `telegram-client-${digest}`;
}

function leadNameFromFacts(result: CrmOrchestrationResult, fallbackText: string): string {
  if (result.facts.contactName) {
    return result.facts.contactName;
  }
  if (result.facts.projectName) {
    return result.facts.projectName;
  }
  const projectParts = [result.facts.projectType, result.facts.location].filter(Boolean);
  if (projectParts.length > 0) {
    return projectParts.join(" - ").slice(0, 120);
  }
  return fallbackText.slice(0, 80) || "TG lead";
}

function draftLeadName(message: TelegramMessage, attachments: TelegramAttachment[]): string {
  if (attachments.length === 0) {
    return `Draft lead from TG #${message.message_id}`;
  }
  const kinds = [...new Set(attachments.map((attachment) => attachment.kind))].join(", ");
  return `Draft lead - ${kinds} from TG #${message.message_id}`;
}

function crmNoteFields(result: CrmOrchestrationResult, rawText: string): string[] {
  const fields = [
    ["Project", result.facts.projectType],
    ["Address", result.facts.location],
    ["Area", result.facts.areaM2 === null ? null : String(result.facts.areaM2)],
    ["Budget EUR", result.facts.budgetEur === null ? null : String(result.facts.budgetEur)],
    ["Raw input", rawText]
  ];
  return fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `${label}: ${value}`);
}

type LeadIntakeUploadResponse = {
  documents?: Array<{
    fileName: string;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    downloadUrl: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  }>;
};

export async function uploadTelegramAttachmentToWeb(
  input: UploadTelegramAttachmentToWebInput
): Promise<LeadIntakeAttachmentInput> {
  const form = new FormData();
  form.set("workspaceId", input.workspaceId);
  form.set("leadId", input.leadId);
  form.set("sourceChannel", input.sourceChannel);
  form.set("sourceThreadId", input.sourceThreadId);
  form.set("sourceMessageId", input.sourceMessageId);
  form.set("text", input.text);
  if (input.author) {
    form.set("author", input.author);
  }
  form.set("summary", `${input.attachment.kind} from TG intake`);
  form.set(
    "file",
    new File([new Blob([Buffer.from(input.bytes)])], input.attachment.fileName, {
      type: input.attachment.mimeType ?? "application/octet-stream"
    })
  );

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.crmApiBase.replace(/\/$/, "")}/api/crm/lead-intake/upload`, {
    method: "POST",
    body: form
  });
  const payload = (await response.json()) as LeadIntakeUploadResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "LightCrm intake upload failed");
  }
  const document = payload.documents?.[0];
  if (!document) {
    throw new Error("LightCrm intake upload did not return a document");
  }
  return {
    sourceMessageId: input.sourceMessageId,
    kind: input.attachment.kind,
    fileName: document.fileName,
    storageProvider: document.storageProvider,
    storageBucket: document.storageBucket,
    storageKey: document.storageKey,
    downloadUrl: document.downloadUrl,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes ?? input.attachment.sizeBytes,
    summary: `${input.attachment.kind} from TG intake`
  };
}

async function maybeCreateLead(
  message: TelegramMessage,
  text: string,
  author: string | null,
  result: CrmOrchestrationResult,
  deps: TelegramBotDeps
): Promise<Pick<Lead, "id" | "name"> | null> {
  const action = actionOfType(result, "create_lead");
  if (!deps.createLead || action?.type !== "create_lead" || action.risk !== "auto") {
    return null;
  }
  const payload = actionPayload(result, action);
  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : leadNameFromFacts(result, text);
  const client =
    deps.createClient && result.facts.contactName
      ? await deps.createClient({
          id: stableTelegramClientId(deps.workspaceId, result.facts.contactName),
          workspaceId: deps.workspaceId,
          name: result.facts.contactName,
          phone: result.facts.phone,
          company: result.facts.projectName,
          sourceChannel: "telegram",
          externalThreadId: String(message.chat.id),
          externalMessageId: String(message.message_id),
          notes: [`TG author: ${author ?? "unknown"}`, ...crmNoteFields(result, text)].join("\n\n")
        })
      : null;
  return deps.createLead({
    workspaceId: deps.workspaceId,
    clientId: client?.id ?? null,
    name,
    phone: result.facts.phone,
    company: result.facts.projectName,
    sourceChannel: "telegram",
    externalThreadId: String(message.chat.id),
    externalMessageId: String(message.message_id),
    notes: [`TG author: ${author ?? "unknown"}`, ...crmNoteFields(result, text)].join("\n\n")
  });
}

async function maybeUpdateLead(
  message: TelegramMessage,
  text: string,
  author: string | null,
  result: CrmOrchestrationResult,
  replyLeadId: string | null,
  deps: TelegramBotDeps
): Promise<Pick<Lead, "id" | "name"> | null> {
  const action = actionOfType(result, "update_lead");
  if (!deps.updateLead || action?.type !== "update_lead" || action.risk !== "auto") {
    return null;
  }
  const payload = actionPayload(result, action);
  const targetId = replyLeadId ?? (typeof payload.targetId === "string" ? payload.targetId : null);
  if (!targetId) {
    return null;
  }
  const patch: TelegramLeadUpdateInput["patch"] = {};
  if (result.facts.contactName) {
    patch.name = result.facts.contactName;
  }
  if (result.facts.phone) {
    patch.phone = result.facts.phone;
  }
  if (result.facts.projectName) {
    patch.company = result.facts.projectName;
  }
  patch.notes = [`TG author: ${author ?? "unknown"}`, ...crmNoteFields(result, text)].join("\n\n");
  return deps.updateLead({
    workspaceId: deps.workspaceId,
    leadId: targetId,
    patch,
    source: {
      channel: "telegram",
      messageId: String(message.message_id)
    }
  });
}

function draftOrchestrationResult(
  workspaceId: string,
  message: TelegramMessage,
  text: string,
  author: string | null,
  attachments: TelegramAttachment[]
): CrmOrchestrationResult {
  const attachmentSummary = attachments
    .map((attachment) => `${attachment.kind}: ${attachment.fileName}`)
    .join("; ");
  const snippet = [text.trim(), attachmentSummary].filter(Boolean).join("\n");
  return {
    workspaceId,
    normalizedText: snippet || `TG attachment intake #${message.message_id}`,
    intent: "create_lead",
    risk: "auto",
    explanations: ["Received TG attachment intake; saved as draft lead for later enrichment."],
    settings: DEFAULT_LANGGRAPH_SETTINGS,
    facts: {
      contactName: null,
      projectName: null,
      projectType: null,
      location: null,
      areaM2: null,
      phone: null,
      budgetEur: null,
      dueAt: null,
      sourceMessageId: String(message.message_id),
      evidence: {
        sourceMessageId: String(message.message_id),
        author,
        sourceChannel: "telegram",
        textSnippet: snippet.slice(0, 240)
      }
    },
    actions: [
      {
        type: "create_lead",
        risk: "auto",
        reason: "Created draft lead from TG intake. Client and project details can be filled later.",
        payload: { name: draftLeadName(message, attachments) }
      }
    ]
  };
}

function attachmentUpdateOrchestrationResult(
  workspaceId: string,
  message: TelegramMessage,
  text: string,
  author: string | null,
  attachments: TelegramAttachment[],
  lead: Pick<Lead, "id" | "name">
): CrmOrchestrationResult {
  const attachmentSummary = attachments
    .map((attachment) => `${attachment.kind}: ${attachment.fileName}`)
    .join("; ");
  const snippet = [text.trim(), attachmentSummary].filter(Boolean).join("\n");
  return {
    workspaceId,
    normalizedText: snippet || `TG attachment update #${message.message_id}`,
    intent: "attach_document",
    risk: "auto",
    explanations: ["Received extra TG attachment intake; linked it to the active lead."],
    settings: DEFAULT_LANGGRAPH_SETTINGS,
    facts: {
      contactName: null,
      projectName: lead.name,
      projectType: null,
      location: null,
      areaM2: null,
      phone: null,
      budgetEur: null,
      dueAt: null,
      sourceMessageId: String(message.message_id),
      evidence: {
        sourceMessageId: String(message.message_id),
        author,
        sourceChannel: "telegram",
        textSnippet: snippet.slice(0, 240)
      }
    },
    actions: [
      {
        type: "update_lead",
        risk: "auto",
        reason: "Linked extra TG attachment intake to the active lead.",
        payload: { targetId: lead.id }
      }
    ]
  };
}

function leadPublicRef(lead: Pick<Lead, "id" | "name"> & Partial<Pick<Lead, "code">>): string {
  return lead.code?.trim() || lead.id;
}

function crmLeadUrl(deps: TelegramBotDeps, lead: Pick<Lead, "id" | "name"> & Partial<Pick<Lead, "code">>): string | null {
  if (!deps.crmAppBaseUrl) {
    return null;
  }
  const baseUrl = deps.crmAppBaseUrl.replace(/\/$/, "");
  return `${baseUrl}/leads?leadId=${encodeURIComponent(leadPublicRef(lead))}`;
}

function crmLeadCallbackData(lead: Pick<Lead, "id" | "name"> & Partial<Pick<Lead, "code">>): string {
  const publicRef = leadPublicRef(lead);
  return publicRef === lead.id ? `crm_lead:${lead.id}` : `crm_lead:${lead.id}:${publicRef}`;
}

function parseCrmLeadCallbackData(value: string): { id: string; publicRef: string } {
  const [, id = "", publicRef = ""] = value.split(":");
  return { id, publicRef: publicRef || id };
}

function isLocalCrmUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isTelegramWebAppUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

type TelegramLeadReplyCard = Pick<Lead, "id" | "name"> & {
  code?: string | null;
  summaryLong?: string | null;
};

function crmLeadReplyMarkup(
  deps: TelegramBotDeps,
  lead: TelegramLeadReplyCard,
  options: { includeUndo?: boolean; undoMode?: "archive" | "not_connected" } = {}
): TelegramSendMessageOptions | undefined {
  const url = crmLeadUrl(deps, lead);
  const hasFullSummary = "summaryLong" in lead && Boolean(lead.summaryLong);
  const summaryRow = hasFullSummary ? [[{ text: "Full summary", callback_data: `summary_lead:${lead.id}` }]] : [];
  const downloadsRow = deps.listLeadDocuments
    ? [[{ text: "Downloads", callback_data: `downloads_lead:${lead.id}` }]]
    : [];
  const undoCallback = options.undoMode === "not_connected" ? `undo_write:${lead.id}` : `undo_lead:${lead.id}`;
  const undoRow = options.includeUndo ? [[{ text: "undo", callback_data: undoCallback }]] : [];
  if (!url) {
    return {
      replyMarkup: {
        inline_keyboard: [[{ text: "offer", callback_data: `offer_lead:${lead.id}` }], ...undoRow, ...summaryRow, ...downloadsRow]
      }
    };
  }
  if (isLocalCrmUrl(url)) {
    return {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "CRM", callback_data: crmLeadCallbackData(lead) },
            { text: "offer", callback_data: `offer_lead:${lead.id}` }
          ],
          ...undoRow,
          ...summaryRow,
          ...downloadsRow
        ]
      }
    };
  }
  const crmButton = isTelegramWebAppUrl(url)
    ? { text: "CRM", web_app: { url } }
    : { text: "CRM", url };
  return {
    replyMarkup: {
      inline_keyboard: [[crmButton, { text: "offer", callback_data: `offer_lead:${lead.id}` }], ...undoRow, ...summaryRow, ...downloadsRow]
    }
  };
}

function extractLeadIdFromReply(reply: TelegramReplyMessage | undefined): string | null {
  const callbackData = reply?.reply_markup?.inline_keyboard
    ?.flat()
    .map((button) => button.callback_data)
    .find((value): value is string =>
      Boolean(
        value?.startsWith("crm_lead:") ||
        value?.startsWith("offer_lead:") ||
        value?.startsWith("summary_lead:") ||
        value?.startsWith("downloads_lead:") ||
        value?.startsWith("undo_lead:") ||
        value?.startsWith("undo_write:")
      )
    );
  if (callbackData?.startsWith("crm_lead:")) {
    return parseCrmLeadCallbackData(callbackData).id;
  }
  if (callbackData?.startsWith("offer_lead:")) {
    return callbackData.slice("offer_lead:".length);
  }
  if (callbackData?.startsWith("summary_lead:")) {
    return callbackData.slice("summary_lead:".length);
  }
  if (callbackData?.startsWith("downloads_lead:")) {
    return callbackData.slice("downloads_lead:".length);
  }
  if (callbackData?.startsWith("undo_lead:")) {
    return callbackData.slice("undo_lead:".length);
  }
  if (callbackData?.startsWith("undo_write:")) {
    return callbackData.slice("undo_write:".length);
  }
  const text = [reply?.text, reply?.caption].filter(Boolean).join("\n");
  const match = text.match(/Lead ID:\s*([^\s]+)/i);
  return match?.[1] ?? null;
}

function leadCardReplyMarkup(
  deps: TelegramBotDeps,
  lead: Pick<Lead, "id" | "name"> & Partial<Pick<Lead, "code">>
): TelegramSendMessageOptions | undefined {
  return crmLeadReplyMarkup(deps, lead);
}

type TelegramLeadCard = Pick<Lead, "id" | "name"> &
  Partial<Pick<Lead, "code" | "status">> & {
    clientName?: string | null;
    project?: string | null;
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
    score?: number | null;
  };

function compactLine(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function optionalStringProperty(value: object, key: string): string | null {
  if (!(key in value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function cardField(label: string, value: string | number | null | undefined, maxLength = 120): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return `${label}: ${compactLine(String(value), maxLength)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function leadDisplayRef(lead: TelegramLeadCard): string {
  return lead.code?.trim() || lead.id;
}

function htmlCardField(label: string, value: string | number | null | undefined, maxLength = 120): string | null {
  const line = cardField(label, value, maxLength);
  return line ? escapeHtml(line) : null;
}

function telegramLeadCardText(lead: TelegramLeadCard): string {
  return [
    lead.code ? `${lead.code} · ${lead.name}` : lead.name,
    `Lead ID: ${lead.id}`,
    cardField("Client", lead.clientName, 90),
    cardField("Project", lead.project, 120),
    cardField("Area", lead.area, 60),
    cardField("Description", lead.description, 120),
    cardField("Interest", lead.interest, 60),
    cardField("Urgency", lead.urgency, 60),
    cardField("Todo", lead.todo, 90),
    cardField("Address", lead.address, 90),
    cardField("Messenger", lead.messenger, 80),
    lead.status ? `Status: ${lead.status}` : null,
    lead.summaryShort ? `Summary: ${compactLine(lead.summaryShort, 140)}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 1200);
}

function telegramLeadFullSummaryText(lead: TelegramLeadCard): string {
  const summary = lead.summaryLong ?? lead.summaryShort;
  return [
    "Full summary",
    lead.code ? `${lead.code} · ${lead.name}` : lead.name,
    `Lead ID: ${lead.id}`,
    summary ? compactLine(summary, 1200) : "No full summary is available yet.",
    lead.summaryUpdatedAt ? `Summary date: ${lead.summaryUpdatedAt}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 3900);
}

function telegramLeadCardTextCompact(lead: TelegramLeadCard): string {
  const summary = lead.summaryShort ? compactLine(lead.summaryShort, 120) : null;
  return [
    "[+] lead saved",
    `<b>${escapeHtml(leadDisplayRef(lead))}</b> - ${escapeHtml(lead.name)}`,
    htmlCardField("client", lead.clientName, 90),
    htmlCardField("project", lead.project, 110),
    htmlCardField("area", lead.area, 50),
    htmlCardField("todo", lead.todo, 80),
    htmlCardField("address", lead.address, 80),
    htmlCardField("messenger", lead.messenger, 70),
    lead.status ? `status: ${escapeHtml(lead.status)}` : null,
    summary ? `[summary] ${escapeHtml(summary)}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 950);
}

function telegramLeadFullSummaryTextCompact(lead: TelegramLeadCard): string {
  const summary = lead.summaryLong ?? lead.summaryShort;
  return [
    "[summary] full",
    `<b>${escapeHtml(leadDisplayRef(lead))}</b> - ${escapeHtml(lead.name)}`,
    summary ? escapeHtml(compactLine(summary, 1200)) : "No full summary is available yet.",
    lead.summaryUpdatedAt ? `summary date: ${escapeHtml(lead.summaryUpdatedAt)}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 3900);
}

function compactDocumentButtonLabel(fileName: string, index: number): string {
  const compacted = compactLine(fileName.replace(/\.[^.]+$/, ""), 24);
  return `${index + 1}. ${compacted}`;
}

function compactDocumentDate(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function telegramLeadDownloadsText(documents: TelegramLeadDocument[]): string {
  if (documents.length === 0) {
    return ["<b>Downloads</b>", "No documents are attached to this lead yet."].join("\n");
  }
  return [
    "<b>Downloads</b>",
    ...documents.flatMap((document, index) => {
      const summary = document.shortSummary || document.longSummary || "No description yet.";
      const createdAt = compactDocumentDate(document.createdAt);
      return [
        "",
        `${index + 1}. <b>${escapeHtml(compactLine(document.fileName, 70))}</b>`,
        `description: ${escapeHtml(compactLine(summary, 180))}`,
        createdAt ? `added: ${escapeHtml(createdAt)}` : null
      ].filter((line): line is string => Boolean(line));
    })
  ]
    .join("\n")
    .slice(0, 3900);
}

function telegramLeadDownloadsReplyMarkup(documents: TelegramLeadDocument[]): TelegramSendMessageOptions | undefined {
  const rows = documents
    .filter((document) => Boolean(document.downloadUrl))
    .slice(0, 8)
    .map((document, index) => [{ text: compactDocumentButtonLabel(document.fileName, index), url: document.downloadUrl! }]);
  if (rows.length === 0) {
    return undefined;
  }
  return {
    replyMarkup: {
      inline_keyboard: rows
    }
  };
}

function leadCardMessageOptions(options: TelegramSendMessageOptions | undefined): TelegramSendMessageOptions {
  return options ?? {};
}

function leadCardFieldsFromFacts(result: CrmOrchestrationResult): Partial<TelegramLeadCard> {
  return {
    clientName: result.facts.contactName,
    project: result.facts.projectName ?? result.facts.projectType,
    area: result.facts.areaM2 === null || result.facts.areaM2 === undefined ? null : String(result.facts.areaM2),
    address: result.facts.location,
    messenger: result.facts.phone
  };
}

function leadSearchQuery(text: string, result: CrmOrchestrationResult): string {
  return (
    result.facts.contactName ??
    result.facts.projectName ??
    result.facts.phone ??
    result.facts.location ??
    text
  ).trim();
}

async function maybeSearchLeads(
  message: TelegramMessage,
  text: string,
  result: CrmOrchestrationResult,
  deps: TelegramBotDeps
): Promise<boolean> {
  const action = actionOfType(result, "search_leads");
  if (!deps.searchLeads || action?.type !== "search_leads") {
    return false;
  }
  const query = leadSearchQuery(text, result);
  const search = await deps.searchLeads({ workspaceId: deps.workspaceId, query, limit: 5 });
  if (search.matches.length === 0) {
    await deps.sendMessage(message.chat.id, `No leads found for: ${query}`);
    return true;
  }

  await deps.sendMessage(message.chat.id, `Found ${search.matches.length} lead(s) for: ${query}`);
  for (const match of search.matches) {
    await deps.sendMessage(
      message.chat.id,
      telegramLeadCardTextCompact(match),
      leadCardMessageOptions(leadCardReplyMarkup(deps, match))
    );
  }
  return true;
}

function reminderTitle(text: string, result: CrmOrchestrationResult): string {
  return (
    result.facts.projectName ??
    result.facts.contactName ??
    result.facts.projectType ??
    text.replace(/\s+/g, " ").trim().slice(0, 80) ??
    "TG reminder"
  );
}

async function maybeCreateReminder(
  message: TelegramMessage,
  text: string,
  result: CrmOrchestrationResult,
  replyLeadId: string | null,
  deps: TelegramBotDeps,
  options: { notify?: boolean } = {}
): Promise<{ handled: boolean; reminder: TelegramReminderResult | null }> {
  const action = actionOfType(result, "create_reminder");
  if (!deps.createReminder || action?.type !== "create_reminder" || action.risk !== "auto") {
    return { handled: false, reminder: null };
  }
  if (!result.facts.dueAt) {
    await deps.sendMessage(message.chat.id, "reminder date is missing");
    return { handled: true, reminder: null };
  }
  const reminder = await deps.createReminder({
    workspaceId: deps.workspaceId,
    leadId: replyLeadId,
    title: reminderTitle(text, result),
    description: [
      result.explanations[0] ?? null,
      `TG message: ${message.message_id}`,
      text.trim() ? `Context: ${text.trim().slice(0, 500)}` : null
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    dueAt: result.facts.dueAt,
    sourceChannel: "telegram"
  });
  if (options.notify ?? true) {
    await deps.sendMessage(
      message.chat.id,
      [
        "Reminder created",
        `Reminder ID: ${reminder.id}`,
        replyLeadId ? `Lead ID: ${replyLeadId}` : null,
        `Due: ${new Date(reminder.dueAt).toISOString()}`,
        `Title: ${reminder.title}`
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    );
  }
  return { handled: true, reminder };
}

export async function handleTelegramCallback(update: TelegramUpdate, deps: TelegramBotDeps): Promise<boolean> {
  const callback = update.callback_query;
  if (!callback?.message) {
    return false;
  }
  const chatId = callback.message.chat.id;
  if (deps.allowedChatIds.size > 0 && !deps.allowedChatIds.has(chatId)) {
    await deps.sendMessage(chatId, "This chat is not allowed to use this LightCrm bot.");
    return true;
  }
  const crmLeadRef = callback.data?.startsWith("crm_lead:") ? parseCrmLeadCallbackData(callback.data) : null;
  if (crmLeadRef?.id) {
    if (!deps.crmAppBaseUrl) {
      return false;
    }
    const url = `${deps.crmAppBaseUrl.replace(/\/$/, "")}/leads?leadId=${encodeURIComponent(crmLeadRef.publicRef)}`;
    await deps.sendMessage(chatId, url);
    return true;
  }
  const undoLeadId = callback.data?.startsWith("undo_lead:") ? callback.data.slice("undo_lead:".length) : null;
  if (undoLeadId) {
    if (!deps.archiveLead) {
      await deps.sendMessage(chatId, "undo is not connected yet");
      return true;
    }
    await deps.archiveLead({ workspaceId: deps.workspaceId, leadId: undoLeadId });
    await deps.sendMessage(chatId, `undone: ${undoLeadId}`);
    return true;
  }
  const undoWriteId = callback.data?.startsWith("undo_write:") ? callback.data.slice("undo_write:".length) : null;
  if (undoWriteId) {
    await deps.sendMessage(chatId, "undo for this update is not connected yet");
    return true;
  }
  const summaryLeadId = callback.data?.startsWith("summary_lead:") ? callback.data.slice("summary_lead:".length) : null;
  if (summaryLeadId) {
    if (!deps.searchLeads) {
      await deps.sendMessage(chatId, "full summary is not available yet");
      return true;
    }
    const search = await deps.searchLeads({ workspaceId: deps.workspaceId, query: summaryLeadId, limit: 1 });
    const lead = search.matches.find((match) => match.id === summaryLeadId) ?? search.matches[0] ?? null;
    if (!lead) {
      await deps.sendMessage(chatId, "full summary is not available yet");
      return true;
    }
    await deps.sendMessage(
      chatId,
      telegramLeadFullSummaryTextCompact(lead),
      leadCardMessageOptions(crmLeadReplyMarkup(deps, { ...lead, summaryLong: null }))
    );
    return true;
  }
  const downloadsLeadId = callback.data?.startsWith("downloads_lead:")
    ? callback.data.slice("downloads_lead:".length)
    : null;
  if (downloadsLeadId) {
    if (!deps.listLeadDocuments) {
      await deps.sendMessage(chatId, "downloads are not connected yet");
      return true;
    }
    const result = await deps.listLeadDocuments({ workspaceId: deps.workspaceId, leadId: downloadsLeadId, limit: 8 });
    await deps.sendMessage(
      chatId,
      telegramLeadDownloadsText(result.documents),
      leadCardMessageOptions(telegramLeadDownloadsReplyMarkup(result.documents))
    );
    return true;
  }
  const offerLeadId = callback.data?.startsWith("offer_lead:") ? callback.data.slice("offer_lead:".length) : null;
  if (offerLeadId) {
    if (!deps.generateOffer || !deps.sendDocument) {
      await deps.sendMessage(chatId, "offer generation is not connected yet");
      return true;
    }
    await deps.sendMessage(chatId, "generating offer, back shortly");
    const document = await deps.generateOffer(offerLeadId);
    await deps.sendDocument(chatId, document);
    return true;
  }
  return false;
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: TelegramBotDeps
): Promise<Pick<Lead, "id" | "name"> | null> {
  if (await handleTelegramCallback(update, deps)) {
    return null;
  }
  const message = update.message;
  if (!message) {
    return null;
  }

  const chatId = message.chat.id;
  if (deps.allowedChatIds.size > 0 && !deps.allowedChatIds.has(chatId)) {
    await deps.sendMessage(chatId, "This chat is not allowed to use this LightCrm bot.");
    return null;
  }

  const text = message.text ?? message.caption ?? "";
  const attachments = extractTelegramAttachments(message);
  const orchestrationText = buildOrchestrationText(message, text, attachments);
  if (text === "/start" || text === "/help") {
    await deps.sendMessage(chatId, helpText());
    return null;
  }
  if (!text.trim() && attachments.length === 0) {
    await deps.sendMessage(chatId, "Please send text or attach files so I can save a draft lead.");
    return null;
  }

  const orchestrate = deps.orchestrate ?? runCrmOrchestration;
  const author = authorName(message.from);
  const replyLeadId = extractLeadIdFromReply(message.reply_to_message);
  const replyLead = replyLeadId ? { id: replyLeadId, name: "replied lead" } : null;
  if (attachments.length > 1) {
    await deps.sendMessage(chatId, "reviewing the files, back shortly");
  }
  const activeLead = replyLead ?? (deps.activeLead && (attachments.length > 0 || text.trim()) ? deps.activeLead : null);
  const result = activeLead
    ? !text.trim() && attachments.length > 0
      ? attachmentUpdateOrchestrationResult(deps.workspaceId, message, text, author, attachments, activeLead)
      : await orchestrate({
          workspaceId: deps.workspaceId,
          messageId: String(message.message_id),
          author,
          text: orchestrationText,
          sourceChannel: "telegram",
          recentLeads: [{ id: activeLead.id, label: activeLead.name, summary: null, lastTouchedAt: null }]
        })
    : text.trim()
      ? await orchestrate({
          workspaceId: deps.workspaceId,
          messageId: String(message.message_id),
          author,
          text: orchestrationText,
          sourceChannel: "telegram"
        })
      : draftOrchestrationResult(deps.workspaceId, message, orchestrationText, author, attachments);
  if (await maybeSearchLeads(message, orchestrationText, result, deps)) {
    return null;
  }
  const shouldCreateLead = hasAutoAction(result, "create_lead");
  const standaloneReminder = shouldCreateLead
    ? { handled: false, reminder: null }
    : await maybeCreateReminder(message, orchestrationText, result, replyLeadId, deps);
  if (standaloneReminder.handled) {
    return replyLeadId ? { id: replyLeadId, name: "replied lead" } : null;
  }
  const updatedLead = await maybeUpdateLead(message, orchestrationText, author, result, replyLeadId, deps);
  const action = result.actions[0];
  const shouldAttachToActiveLead =
    Boolean(activeLead && (attachments.length > 0 || text.trim()) && action?.type !== "create_lead");
  let createdLead: Pick<Lead, "id" | "name"> | null = null;
  const lead =
    updatedLead ??
    (shouldAttachToActiveLead ? activeLead : null) ??
    (createdLead = await maybeCreateLead(message, orchestrationText, author, result, deps));
  if (lead) {
    const reminderOutcome = await maybeCreateReminder(message, orchestrationText, result, lead.id, deps, { notify: false });
    const preparedAttachments =
      deps.prepareAttachment && attachments.length > 0
        ? await Promise.all(
            attachments.map((attachment, index) =>
              deps.prepareAttachment?.({
                workspaceId: deps.workspaceId,
                leadId: lead.id,
                attachment,
                message,
                text: index === 0 ? orchestrationText.trim() || result.normalizedText : "",
                author
              })
            )
          )
        : [];
    const intake =
      preparedAttachments.length === 0 && deps.ingestLeadIntake
        ? await deps.ingestLeadIntake({
        workspaceId: deps.workspaceId,
        leadId: lead.id,
        sourceChannel: "telegram",
        sourceThreadId: String(message.chat.id),
        sourceMessageId: String(message.message_id),
        textItems: [{ sourceMessageId: String(message.message_id), author, text: orchestrationText }],
        attachments: []
          })
        : null;
    await deps.sendMessage(
      chatId,
      [
        telegramLeadCardTextCompact({
          ...lead,
          ...leadCardFieldsFromFacts(result),
          code: optionalStringProperty(lead, "code"),
          status: (optionalStringProperty(lead, "status") as Lead["status"] | null) ?? undefined,
          summaryShort: intake?.summary ?? null
        }),
        reminderOutcome.reminder
          ? `Reminder: ${reminderOutcome.reminder.id} at ${new Date(reminderOutcome.reminder.dueAt).toISOString()}`
          : null,
        `Intake: saved ${preparedAttachments.length} attachment(s) to ${lead.name}.`,
        crmLeadReplyMarkup(deps, lead, {
          includeUndo: Boolean(createdLead || updatedLead),
          undoMode: createdLead ? "archive" : "not_connected"
        })
          ? null
          : crmLeadUrl(deps, lead)
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
        .slice(0, 3900),
      leadCardMessageOptions(
        crmLeadReplyMarkup(deps, lead, {
          includeUndo: Boolean(createdLead || updatedLead),
          undoMode: createdLead ? "archive" : "not_connected"
        })
      )
    );
    return lead;
  }

  await deps.sendMessage(chatId, formatOrchestrationReply(result));
  return null;
}
