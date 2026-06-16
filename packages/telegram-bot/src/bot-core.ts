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
  date?: number;
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
  summary?: string | null;
  longSummary?: string | null;
  fetchImpl?: typeof fetch;
};

export type TelegramBotDeps = {
  allowedChatIds: Set<number>;
  workspaceId: string;
  crmAppBaseUrl?: string;
  activeLead?: Pick<Lead, "id" | "name"> | null;
  forceAttachToActiveLead?: boolean;
  forceCreateNewLead?: boolean;
  sendMessage: (chatId: number, text: string, options?: TelegramSendMessageOptions) => Promise<unknown> | unknown;
  sendDocument?: (chatId: number, document: TelegramGeneratedDocument) => Promise<unknown> | unknown;
  generateOffer?: (leadId: string) => Promise<TelegramGeneratedDocument>;
  orchestrate?: (input: CrmOrchestrationInput) => Promise<CrmOrchestrationResult>;
  createClient?: (input: UpsertClientInput) => Promise<Pick<Client, "id" | "name">>;
  createLead?: (input: UpsertLeadInput) => Promise<Pick<Lead, "id" | "name">>;
  searchLeads?: (input: TelegramLeadSearchInput) => Promise<TelegramLeadSearchResult>;
  listRecentLeads?: (input: TelegramRecentLeadsInput) => Promise<TelegramLeadSearchResult>;
  updateLead?: (input: TelegramLeadUpdateInput) => Promise<Pick<Lead, "id" | "name">>;
  createReminder?: (input: TelegramReminderInput) => Promise<TelegramReminderResult>;
  createCalendarEvent?: (input: TelegramCalendarEventInput) => Promise<TelegramCalendarEventResult>;
  ingestLeadIntake?: (input: IngestLeadIntakeInput) => Promise<{ documents?: unknown[]; summary?: string }>;
  prepareAttachment?: (input: PrepareTelegramAttachmentInput) => Promise<LeadIntakeAttachmentInput>;
  listLeadDocuments?: (input: TelegramLeadDocumentsInput) => Promise<TelegramLeadDocumentsResult>;
  archiveLead?: (input: TelegramArchiveLeadInput) => Promise<unknown>;
  undoLeadIntake?: (input: TelegramUndoLeadIntakeInput) => Promise<TelegramUndoLeadIntakeResult>;
  startNewLeadMode?: (chatId: number) => void;
  createPendingAttachmentDecision?: (input: PendingAttachmentDecision) => string;
  takePendingAttachmentDecision?: (id: string) => PendingAttachmentDecision | null;
  createPendingClarification?: (input: PendingClarification) => string;
  takePendingClarification?: (input: TakePendingClarificationInput) => PendingClarification | null;
};

export type PendingAttachmentDecision = {
  message: TelegramMessage;
  activeLead: Pick<Lead, "id" | "name">;
};

export type PendingClarification = {
  chatId: number;
  promptMessageId?: number | null;
  message: TelegramMessage;
  orchestrationText: string;
  result: CrmOrchestrationResult;
  kind: "calendar" | "reminder";
};

export type TakePendingClarificationInput = {
  chatId: number;
  replyToMessageId?: number | null;
};

export type TelegramLeadSearchInput = {
  workspaceId: string;
  query: string;
  limit?: number;
};

export type TelegramRecentLeadsInput = {
  workspaceId: string;
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
  patch: Partial<
    Pick<UpsertLeadInput, "name" | "email" | "phone" | "whatsapp" | "company" | "status" | "notes" | "sourceChannel">
  > & {
    projectName?: string | null;
    project?: string | null;
    area?: string | null;
    description?: string | null;
    interest?: string | null;
    urgency?: string | null;
    todo?: string | null;
    address?: string | null;
    messenger?: string | null;
    clientProjects?: string | null;
    budgetEur?: string | null;
    rawInput?: string | null;
  };
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

export type TelegramCalendarEventInput = {
  workspaceId: string;
  leadId?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  location?: string | null;
};

export type TelegramCalendarEventResult = {
  id: string;
  title: string;
  startsAt: string | Date;
  endsAt: string | Date;
};

export type TelegramArchiveLeadInput = {
  workspaceId: string;
  leadId: string;
};

export type TelegramUndoLeadIntakeInput = {
  workspaceId: string;
  leadId: string;
  sourceMessageId?: string | null;
};

export type TelegramUndoLeadIntakeResult = {
  archivedDocumentIds?: string[];
  archivedSummaryIds?: string[];
};

export type TelegramGeneratedDocument = {
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
  caption?: string;
  offerVersion?: number | null;
  offerMissingFields?: string[];
  offerTotalGross?: number | null;
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

function activeTextUpdateReviewResult(result: CrmOrchestrationResult, activeLead: Pick<Lead, "id" | "name">): CrmOrchestrationResult {
  return {
    ...result,
    risk: "review",
    actions: [
      {
        type: "request_review",
        risk: "review",
        reason:
          "This is a text-only message without a reply to a lead card; active lead context alone is not enough to update silently.",
        payload: {
          activeLeadId: activeLead.id,
          activeLeadName: activeLead.name,
          originalIntent: result.intent,
          originalActions: result.actions.map((action) => action.type)
        }
      }
    ],
    explanations: [
      "Active lead context was treated as a weak magnet because this text-only message was not sent as a reply to a lead card.",
      ...result.explanations
    ]
  };
}

function helpText(): string {
  return helpResponse("general");
}

type HelpTopic = "intro" | "general" | "lead" | "reminder" | "offer" | "files" | "mobile";

function helpResponse(topic: HelpTopic): string {
  const replies: Record<HelpTopic, string> = {
    intro: [
      "LightCrm help",
      "I am your CRM assistant for leads, documents, reminders, and commercial offers.",
      "Send me a client request, forwarded message, file, image, PDF, or voice note. I will save it to the right lead or create a draft when it looks new.",
      "Ask naturally how leads, reminders, files, mobile CRM, or offers work."
    ].join("\n"),
    general: [
      "LightCrm help",
      "Commands: /crm opens the CRM, /search shows recent leads, /newlead starts a clean new lead intake.",
      "1. New lead: send the request, files, screenshots, or voice notes. I can create a draft lead when some details are still missing.",
      "2. Update lead: reply to a lead card and write what changed.",
      "3. Reminder: write: remind me in two weeks to call the client.",
      "4. Offer: open a lead card and tap offer. I will generate the DOCX if the price can be calculated.",
      "5. CRM: tap CRM to open the lead in the web/mobile app."
    ].join("\n"),
    lead: [
      "New lead",
      "Send the client request in one message if possible. You can add PDFs, images, voice notes, and forwarded context.",
      "Good example: the client asks for a house in Munich, 140 m2, and wants an LP 3-4 offer.",
      "If details are missing, I will create a draft lead and you can fill it later."
    ].join("\n"),
    reminder: [
      "Reminders",
      "Write a natural request with a date or relative time.",
      "Example: remind me in two weeks to send the offer.",
      "If you reply to a lead card, the reminder will be linked to that lead."
    ].join("\n"),
    offer: [
      "Commercial offers",
      "Tap offer on a lead card. I use the active DOCX template and fee table from CRM settings.",
      "If the price is ready, I send back a DOCX like commercial-offer-V1d.",
      "If fields are missing, I will say what to add before sending, for example: client name, project address."
    ].join("\n"),
    files: [
      "Files and documents",
      "Send PDFs, images, documents, or voice notes with a short caption.",
      "I save them in Downloads, summarize them, and attach them to the active or replied lead.",
      "Recent documents appear first. Commercial offers are shown as V1, V2, V3."
    ].join("\n"),
    mobile: [
      "Mobile and TG",
      "Use TG for quick intake: forward requests, add files, and reply to lead cards.",
      "Use CRM for review: tap CRM to open the lead card, documents, calendar, and details.",
      "On mobile, lead cards are compact and show summary, downloads, and next actions."
    ].join("\n")
  };
  return replies[topic];
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

function forceCreateLeadResult(result: CrmOrchestrationResult): CrmOrchestrationResult {
  if (hasAutoAction(result, "create_lead")) {
    return result;
  }
  return {
    ...result,
    intent: "create_lead",
    risk: "auto",
    actions: [
      {
        type: "create_lead",
        risk: "auto",
        reason: "User explicitly chose to create a new lead from the pending Telegram intake.",
        payload: {}
      }
    ]
  };
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
    return projectParts.join(" - ");
  }
  return fallbackText.replace(/\s+/g, " ").trim() || "TG lead";
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

function isGenericAttachmentSummary(value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    !normalized ||
    /^(image|pdf|audio|voice|document|other) from tg intake$/.test(normalized) ||
    normalized.includes("no semantic file analysis is available yet") ||
    normalized.includes("attached to lead intake")
  );
}

function semanticAttachmentText(attachments: LeadIntakeAttachmentInput[]): string | null {
  const lines = attachments.flatMap((attachment, index) => {
    const pieces = [
      isGenericAttachmentSummary(attachment.summary) ? null : attachment.summary,
      isGenericAttachmentSummary(attachment.longSummary) ? null : attachment.longSummary
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim());
    if (pieces.length === 0) {
      return [];
    }
    return [`Attachment ${index + 1} (${attachment.kind}, ${attachment.fileName}): ${pieces.join(" ")}`];
  });
  return lines.length > 0 ? `Semantic attachment analysis:\n${lines.join("\n")}` : null;
}

function usableFactText(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase();
  if (
    normalized === "not explicitly stated" ||
    normalized === "not stated" ||
    normalized === "unknown" ||
    normalized === "n/a"
  ) {
    return null;
  }
  return trimmed;
}

function leadPatchFromFacts(result: CrmOrchestrationResult, text: string): TelegramLeadUpdateInput["patch"] {
  const patch: TelegramLeadUpdateInput["patch"] = {};
  const contactName = usableFactText(result.facts.contactName);
  const projectName = usableFactText(result.facts.projectName);
  const projectType = usableFactText(result.facts.projectType);
  const location = usableFactText(result.facts.location);
  if (contactName) {
    patch.name = contactName;
  }
  if (result.facts.phone) {
    patch.phone = result.facts.phone;
  }
  if (projectName) {
    if (!patch.name) {
      patch.name = projectName;
    }
    patch.company = projectName;
    patch.projectName = projectName;
  }
  if (projectType) {
    if (!patch.name) {
      patch.name = projectType;
    }
    patch.project = projectType;
  }
  if (location) {
    patch.address = location;
  }
  if (result.facts.areaM2 !== null && result.facts.areaM2 !== undefined) {
    patch.area = String(result.facts.areaM2);
  }
  if (result.facts.budgetEur !== null && result.facts.budgetEur !== undefined) {
    patch.budgetEur = String(result.facts.budgetEur);
  }
  if (text.trim()) {
    patch.rawInput = text;
  }
  return patch;
}

function hasLeadPatchFields(patch: TelegramLeadUpdateInput["patch"]): boolean {
  return Object.keys(patch).length > 0;
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
  const summary = input.summary?.trim() || `${input.attachment.kind} from TG intake`;
  const longSummary = input.longSummary?.trim() || null;
  form.set("summary", summary);
  if (longSummary) {
    form.set("longSummary", longSummary);
  }
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
    summary,
    longSummary
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
  const patch = leadPatchFromFacts(result, text);
  if (!hasLeadPatchFields(patch)) {
    return null;
  }
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

async function maybeEnrichLeadFromAttachments(
  message: TelegramMessage,
  author: string | null,
  lead: Pick<Lead, "id" | "name">,
  attachments: LeadIntakeAttachmentInput[],
  deps: TelegramBotDeps
): Promise<{ lead: Pick<Lead, "id" | "name">; result: CrmOrchestrationResult | null; text: string | null }> {
  if (!deps.updateLead || attachments.length === 0) {
    return { lead, result: null, text: null };
  }
  const text = semanticAttachmentText(attachments);
  if (!text) {
    return { lead, result: null, text: null };
  }
  const orchestrate = deps.orchestrate ?? runCrmOrchestration;
  const result = await orchestrate({
    workspaceId: deps.workspaceId,
    messageId: String(message.message_id),
    author,
    text,
    sourceChannel: "telegram",
    recentLeads: [{ id: lead.id, label: lead.name, summary: null, lastTouchedAt: null }]
  });
  const updatedLead =
    (await maybeUpdateLead(message, text, author, result, lead.id, deps)) ??
    (hasLeadPatchFields(leadPatchFromFacts(result, text))
      ? await deps.updateLead({
          workspaceId: deps.workspaceId,
          leadId: lead.id,
          patch: leadPatchFromFacts(result, text),
          source: {
            channel: "telegram",
            messageId: String(message.message_id)
          }
        })
      : null);
  return { lead: updatedLead ?? lead, result, text };
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

function pendingAttachmentDecisionText(lead: Pick<Lead, "id" | "name">): string {
  return [
    "Files received without text while another lead is active.",
    `Active lead: ${lead.name} (${lead.id})`,
    "Should I add these files to the active lead or create a new lead?"
  ].join("\n");
}

function pendingAttachmentDecisionReplyMarkup(id: string): TelegramSendMessageOptions {
  return {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "new lead", callback_data: `attachment_new:${id}` },
          { text: "add to active", callback_data: `attachment_active:${id}` }
        ],
        [{ text: "cancel", callback_data: `attachment_cancel:${id}` }]
      ]
    }
  };
}

function pendingActiveTextDecisionText(lead: Pick<Lead, "id" | "name">): string {
  return [
    "This text may be a separate lead, but another lead is active.",
    `Active lead: ${lead.name} (${lead.id})`,
    "Should I create a new lead or add this text to the active lead?"
  ].join("\n");
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

function crmHomeReplyMarkup(deps: TelegramBotDeps): TelegramSendMessageOptions | undefined {
  if (!deps.crmAppBaseUrl) {
    return undefined;
  }
  const url = deps.crmAppBaseUrl.replace(/\/$/, "");
  const button = isTelegramWebAppUrl(url)
    ? { text: "CRM", web_app: { url } }
    : isLocalCrmUrl(url)
      ? { text: "CRM", callback_data: "crm_home" }
      : { text: "CRM", url };
  return {
    replyMarkup: {
      inline_keyboard: [[button]]
    }
  };
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
  options: { includeUndo?: boolean; undoMode?: "archive" | "write"; undoSourceMessageId?: string | null } = {}
): TelegramSendMessageOptions | undefined {
  const url = crmLeadUrl(deps, lead);
  const undoCallback =
    options.undoMode === "write"
      ? ["undo_write", lead.id, options.undoSourceMessageId].filter(Boolean).join(":")
      : `undo_lead:${lead.id}`;
  const actionRow: Array<{ text: string; callback_data?: string; url?: string; web_app?: { url: string } }> = [];
  if (options.includeUndo) {
    actionRow.push({ text: "undo", callback_data: undoCallback });
  }
  actionRow.push({ text: "offer", callback_data: `offer_lead:${lead.id}` });
  const detailRow =
    !options.includeUndo && lead.summaryLong
      ? [
          { text: "summary", callback_data: `summary_lead:${lead.id}` },
          { text: "downloads", callback_data: `downloads_lead:${lead.id}` }
        ]
      : null;
  const rows = detailRow ? [actionRow, detailRow] : [actionRow];
  if (!url) {
    return {
      replyMarkup: {
        inline_keyboard: rows
      }
    };
  }
  if (isLocalCrmUrl(url)) {
    actionRow.push({ text: "CRM", callback_data: crmLeadCallbackData(lead) });
    return {
      replyMarkup: {
        inline_keyboard: rows
      }
    };
  }
  const crmButton = isTelegramWebAppUrl(url)
    ? { text: "CRM", web_app: { url } }
    : { text: "CRM", url };
  actionRow.push(crmButton);
  return {
    replyMarkup: {
      inline_keyboard: rows
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

function replyText(reply: TelegramReplyMessage | undefined): string {
  return [reply?.text, reply?.caption].filter(Boolean).join("\n").trim();
}

function appendReplyContext(text: string, reply: TelegramReplyMessage | undefined): string {
  const replied = replyText(reply);
  if (!replied || extractLeadIdFromReply(reply)) {
    return text;
  }
  return [text.trim(), `Replied message: ${replied}`].filter(Boolean).join("\n\n");
}

function sentTelegramMessageId(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("message_id" in value)) {
    return null;
  }
  const messageId = (value as { message_id?: unknown }).message_id;
  return typeof messageId === "number" && Number.isSafeInteger(messageId) ? messageId : null;
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
    offerMissingFields?: string | null;
    score?: number | null;
  };

function compactLine(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

const telegramSummaryShortMax = 220;
const telegramSummaryFullMax = 420;

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

function htmlLeadField(label: string, value: string | number | null | undefined, maxLength = 120): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return `<i>${escapeHtml(label)}</i>: ${escapeHtml(compactLine(String(value), maxLength))}`;
}

function formatTelegramArea(value: string | number | null | undefined): string | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "—" || raw === "-") {
    return null;
  }
  const numeric = Number(raw.replace(/\s+/g, "").replace(",", ".").replace(/m²|м²|m2/gi, ""));
  if (!Number.isFinite(numeric)) {
    return raw.includes("m²") || raw.includes("м²") || raw.toLocaleLowerCase().includes("m2") ? raw : `${raw} m²`;
  }
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 1
  }).format(numeric);
  return `${formatted} m²`;
}

function expandableQuote(title: string, body: string): string {
  const compactBody = body.replace(/\s+/g, " ").trim();
  return `<blockquote expandable><b>${escapeHtml(title)}</b>${compactBody ? ` ${compactBody}` : ""}</blockquote>`;
}

function compactQuote(title: string, body: string): string {
  const compactBody = body.replace(/\s+/g, " ").trim();
  return `<blockquote><b>${escapeHtml(title)}</b>${compactBody ? ` ${escapeHtml(compactBody)}` : ""}</blockquote>`;
}

function formatOfferMissingFields(value: string | null | undefined): string {
  const fields = value
    ?.split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!fields || fields.length === 0) {
    return "No missing fields detected.";
  }
  return fields.map((field) => `- ${escapeHtml(field)}`).join("\n");
}

function telegramLeadDownloadsQuote(documents: TelegramLeadDocument[]): string | null {
  if (documents.length === 0) {
    return null;
  }
  const title = `Downloads: ${documents.length} ${documents.length === 1 ? "item" : "items"}`;
  const labels = labelTelegramDocuments(documents);
  const documentLine = (document: TelegramLeadDocument, index: number) => {
    const summary = document.shortSummary || document.longSummary || "No summary yet.";
    const createdAt = compactDocumentDate(document.createdAt);
    const label = document.downloadUrl
      ? `<a href="${escapeHtml(document.downloadUrl)}">${escapeHtml(labels[index] ?? documentKindLabel(document))}</a>`
      : escapeHtml(labels[index] ?? documentKindLabel(document));
    return [
      label,
      escapeHtml(compactLine(summary, documents.length === 1 ? 120 : 80)),
      createdAt ? escapeHtml(createdAt) : null
    ]
      .filter((line): line is string => Boolean(line))
      .join(" - ");
  };
  if (documents.length === 1) {
    return `<b>Downloads</b>: ${documentLine(documents[0]!, 0)}`;
  }
  const body = documents.slice(0, 8).map(documentLine).join("; ");
  return expandableQuote(title, body);
}

function documentKindLabel(document: Pick<TelegramLeadDocument, "fileName" | "mimeType">): string {
  const offerVersion = commercialOfferVersionLabel(document);
  if (offerVersion) {
    return offerVersion;
  }
  const fileName = document.fileName.toLocaleLowerCase();
  const mimeType = document.mimeType?.toLocaleLowerCase() ?? "";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(fileName)) {
    return "picture";
  }
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return "PDF";
  }
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    /\.(xlsx?|csv|ods)$/i.test(fileName)
  ) {
    return "spreadsheet";
  }
  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument.wordprocessingml") ||
    /\.(docx?|rtf)$/i.test(fileName)
  ) {
    return "DOC";
  }
  if (mimeType.startsWith("audio/") || /\.(mp3|m4a|ogg|wav|aac|opus)$/i.test(fileName)) {
    return "audio";
  }
  if (mimeType.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName)) {
    return "video";
  }
  return "document";
}

function commercialOfferVersionLabel(document: Pick<TelegramLeadDocument, "fileName"> & { shortSummary?: string | null }): string | null {
  const combined = `${document.fileName} ${document.shortSummary ?? ""}`.toLocaleLowerCase();
  if (!combined.includes("commercial offer")) {
    return null;
  }
  const draftSuffix = /\bv\d+d\b|\bdraft\b/.test(combined) ? "d" : "";
  const versionMatch =
    combined.match(/commercial-offer-v(\d+)d?/) ??
    combined.match(/\bcommercial offer v(\d+)\b/) ??
    combined.match(/\boffer v(\d+)\b/);
  return versionMatch?.[1] ? `V${versionMatch[1]}${draftSuffix}` : draftSuffix ? "offer draft" : "offer";
}

function labelTelegramDocuments(documents: Array<Pick<TelegramLeadDocument, "fileName" | "mimeType" | "shortSummary">>): string[] {
  const baseLabels = documents.map(documentKindLabel);
  const counts = new Map<string, number>();
  for (const label of baseLabels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return baseLabels.map((label) => {
    const next = (seen.get(label) ?? 0) + 1;
    seen.set(label, next);
    return (counts.get(label) ?? 0) > 1 ? `${label} ${next}` : label;
  });
}

function displaySummaryText(lead: TelegramLeadCard): string | null {
  const raw = lead.summaryShort?.trim();
  if (!raw) {
    return null;
  }
  const cleaned = raw
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^Lead intake summary\s*$/i, "")
        .replace(/^Source:\s*TG thread\s+\S+\.\s*Text:\s*/i, "")
        .replace(/\s*Files:\s*.*$/i, "")
        .replace(/^Original takes\s*$/i, "")
        .replace(/^-\s+.*$/i, "")
        .replace(/^-\s*(?:image|pdf|audio|voice|document):.*$/i, "")
        .replace(/^-\s*[^:]{1,40}#?\d*:\s*/i, "")
        .replace(/^Received TG message\.\s*/i, "")
        .trim()
    )
    .filter(Boolean)
    .join(" ");
  return cleaned ? compactLine(cleaned, telegramSummaryShortMax) : null;
}

function independentFallbackSummary(value: string | null | undefined): string | null {
  const cleaned = displaySummaryText({ id: "summary-fallback", name: "summary", summaryShort: value?.trim() || null });
  if (!cleaned) {
    return null;
  }
  const withoutLeadMarker = cleaned
    .replace(/^(?:следующ(?:ий|ая|ее)\s+)?(?:нов(?:ый|ая|ое)\s+)?(?:лид|клиент|объект|запрос)[:,]?\s*/i, "")
    .replace(/^(?:new|next|another)\s+(?:lead|client|object|request)[:,]?\s*/i, "")
    .trim();
  const fragments = withoutLeadMarker
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const leadFragment = fragments[0] ?? withoutLeadMarker;
  const timingFragment = fragments
    .slice(1)
    .find((part) => /(?:срок|когда|лет|осен|весн|апрел|май|июн|июл|август|сентябр|октябр|ноябр|декабр|next|spring|summer|autumn|fall|month|week)/i.test(part));
  const body = [leadFragment, timingFragment].filter(Boolean).join(" ");
  return body ? compactLine(`Potential lead: ${body}`, telegramSummaryShortMax) : null;
}

function leadCardSummaryFromResult(result: CrmOrchestrationResult, fallback: string | null | undefined): string | null {
  const facts = result.facts;
  const subject = facts.contactName?.trim() || facts.projectName?.trim() || null;
  const project = facts.projectType?.trim() || facts.projectName?.trim() || null;
  const location = facts.location?.trim() || null;
  const area = facts.areaM2 ? `${facts.areaM2} m²` : null;
  const budget = facts.budgetEur ? `${facts.budgetEur} EUR` : null;
  const due = facts.dueAt?.trim() || null;
  const pieces = [
    subject ? `${subject}:` : "Lead update:",
    project ? project : null,
    location ? `in ${location}` : null,
    area ? `area ${area}` : null,
    budget ? `budget ${budget}` : null,
    due ? `due ${due}` : null
  ].filter(Boolean);
  if (pieces.length > 1) {
    return compactLine(pieces.join(" "), telegramSummaryShortMax);
  }
  return independentFallbackSummary(fallback);
}

function leadCardTitleLine(lead: TelegramLeadCard): string {
  const client = lead.clientName?.trim() || lead.name;
  const leadName = lead.project?.trim() || lead.name;
  const pieces = client === leadName ? [client] : [client, leadName];
  return pieces.map((piece) => escapeHtml(piece)).join("  ");
}

function telegramRecentLeadsText(leads: TelegramLeadSearchResult["matches"]): string {
  if (leads.length === 0) {
    return "No recent leads yet.";
  }
  return [
    "<b>Recent leads</b>",
    ...leads.map((lead, index) => {
      const ref = lead.code?.trim() || lead.id;
      const client = lead.clientName?.trim() || lead.name;
      const project = lead.project?.trim() || lead.name;
      const title = client === project ? client : `${client} - ${project}`;
      return `${index + 1}. <b>${escapeHtml(ref)}</b> ${escapeHtml(compactLine(title, 92))}`;
    })
  ].join("\n");
}

function telegramRecentLeadsReplyMarkup(leads: TelegramLeadSearchResult["matches"]): TelegramSendMessageOptions | undefined {
  if (leads.length === 0) {
    return undefined;
  }
  const rows = leads.map((lead) => [
    {
      text: lead.code?.trim() || compactLine(lead.name, 18),
      callback_data: `crm_show:${lead.id}`
    }
  ]);
  return {
    replyMarkup: {
      inline_keyboard: rows
    }
  };
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
    lead.summaryShort ? `Summary: ${compactLine(lead.summaryShort, telegramSummaryShortMax)}` : null
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
    summary ? compactLine(summary, telegramSummaryFullMax) : "No full summary is available yet.",
    lead.summaryUpdatedAt ? `Summary date: ${lead.summaryUpdatedAt}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 3900);
}

function telegramLeadActionBadge(action: "create" | "update" | null | undefined): string | null {
  if (action === "create") {
    return " \u{1f7e2} <code>create</code>";
  }
  if (action === "update") {
    return " \u{1f7e1} <code>update</code>";
  }
  return null;
}

function telegramLeadCardTextCompact(
  lead: TelegramLeadCard,
  documents: TelegramLeadDocument[] = [],
  actionBadge?: "create" | "update" | null
): string {
  const summary = displaySummaryText(lead);
  return [
    `<b>${escapeHtml(leadDisplayRef(lead))}</b>${telegramLeadActionBadge(actionBadge) ?? ""}`,
    `<b>${leadCardTitleLine(lead)}</b>`,
    htmlLeadField("Area", formatTelegramArea(lead.area), 50),
    htmlLeadField("Description", lead.description, 120),
    htmlLeadField("Todo", lead.todo, 80),
    htmlLeadField("Address", lead.address, 80),
    htmlLeadField("Messenger", lead.messenger, 70),
    expandableQuote("Missing for offer", formatOfferMissingFields(lead.offerMissingFields)),
    telegramLeadDownloadsQuote(documents),
    summary ? expandableQuote("Summary", summary) : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function telegramLeadFullSummaryTextCompact(lead: TelegramLeadCard): string {
  const summary = lead.summaryLong ?? lead.summaryShort;
  return [
    "[summary] full",
    `<b>${escapeHtml(leadDisplayRef(lead))}</b> - ${escapeHtml(lead.name)}`,
    summary ? escapeHtml(compactLine(summary, telegramSummaryFullMax)) : "No full summary is available yet.",
    lead.summaryUpdatedAt ? `summary date: ${escapeHtml(lead.summaryUpdatedAt)}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 3900);
}

function compactDocumentDate(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatTelegramDateTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: process.env.LIGHTCRM_TIME_ZONE ?? "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function telegramCalendarLine(events: TelegramCalendarEventResult[]): string | null {
  if (events.length === 0) {
    return null;
  }
  const eventLine = (event: TelegramCalendarEventResult, index: number) =>
    [
      events.length > 1 ? `${index + 1}.` : null,
      escapeHtml(event.title),
      "-",
      `<b>${escapeHtml(formatTelegramDateTime(event.startsAt))}</b>`
    ]
      .filter((part): part is string => Boolean(part))
      .join(" ");
  if (events.length === 1) {
    return `<i>Calendar</i>: ${eventLine(events[0]!, 0)}`;
  }
  return `<i>Calendar</i>: ${events.map(eventLine).join("; ")}`;
}

function telegramLeadDownloadsText(documents: TelegramLeadDocument[]): string {
  if (documents.length === 0) {
    return ["<b>Downloads</b>", "No documents are attached to this lead yet."].join("\n");
  }
  const labels = labelTelegramDocuments(documents);
  return [
    "<b>Downloads</b>",
    ...documents.flatMap((document, index) => {
      const summary = document.shortSummary || document.longSummary || "No description yet.";
      const createdAt = compactDocumentDate(document.createdAt);
      const label = labels[index] ?? documentKindLabel(document);
      const linkedLabel = document.downloadUrl
        ? `<a href="${escapeHtml(document.downloadUrl)}">${escapeHtml(label)}</a>`
        : escapeHtml(label);
      return [
        "",
        `${index + 1}. <b>${linkedLabel}</b>`,
        `description: ${escapeHtml(compactLine(summary, 180))}`,
        createdAt ? `added: ${escapeHtml(createdAt)}` : null
      ].filter((line): line is string => Boolean(line));
    })
  ]
    .join("\n")
    .slice(0, 3900);
}

function telegramLeadDownloadsReplyMarkup(documents: TelegramLeadDocument[]): TelegramSendMessageOptions | undefined {
  const labels = labelTelegramDocuments(documents);
  const rows = documents
    .map((document, index) => ({ document, label: labels[index] ?? documentKindLabel(document) }))
    .filter(({ document }) => Boolean(document.downloadUrl))
    .slice(0, 8)
    .map(({ document, label }) => [{ text: label, url: document.downloadUrl! }]);
  if (rows.length === 0) {
    return undefined;
  }
  return {
    replyMarkup: {
      inline_keyboard: rows
    }
  };
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

function formatOfferCallbackError(error: unknown, leadId?: string | null): string {
  const message = error instanceof Error ? error.message : String(error);
  const payload = error instanceof Error ? (error as Error & { payload?: { readiness?: { priceMissingFields?: string[]; documentMissingFields?: string[] } } }).payload : null;
  const priceMissingFields = payload?.readiness?.priceMissingFields ?? [];
  const documentMissingFields = payload?.readiness?.documentMissingFields ?? [];
  const normalized = message.toLocaleLowerCase();
  if (normalized.includes("template")) {
    return "offer template is missing. add an offer template in CRM settings.";
  }
  if (normalized.includes("numbers are not ready") || normalized.includes("active fee table") || normalized.includes("missing fields")) {
    const priceLine =
      priceMissingFields.length > 0
        ? priceMissingFields.map(humanOfferFieldName).join(", ")
        : "BGF / area + project type, or manual gross price";
    const optionalLine =
      documentMissingFields.length > 0
        ? documentMissingFields.map(humanOfferFieldName).join(", ")
        : "client name, lead name, project address";
    return [
      "<b>Offer price is not ready</b>",
      leadId ? `Lead ID: ${leadId}` : null,
      `<b>Need for price:</b> ${priceLine}.`,
      `<b>Optional for document:</b> ${optionalLine}.`,
      "Reply here, for example: <code>manual gross price: 12.500 EUR</code>"
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }
  return `offer generation failed. ${compactLine(message, 180)}`;
}

function leadCardMessageOptions(options: TelegramSendMessageOptions | undefined): TelegramSendMessageOptions {
  return options ?? {};
}

function telegramCommandName(text: string): string | null {
  return text.trim().match(/^\/([a-zA-Z_]+)(?:@[A-Za-z0-9_]+)?(?:\s|$)/)?.[1]?.toLowerCase() ?? null;
}

function leadCardFieldsFromFacts(result: CrmOrchestrationResult): Partial<TelegramLeadCard> {
  return {
    clientName: result.facts.contactName,
    project: result.facts.projectName ?? result.facts.projectType,
    area: result.facts.areaM2 === null || result.facts.areaM2 === undefined ? null : String(result.facts.areaM2),
    address: result.facts.location,
    messenger: result.facts.phone,
    offerMissingFields: offerMissingFieldsFromFacts(result)
  };
}

function offerMissingFieldsFromFacts(result: CrmOrchestrationResult): string | null {
  const missing: string[] = [];
  const hasManualPrice = result.facts.budgetEur !== null && result.facts.budgetEur !== undefined;
  if (!hasManualPrice && (!result.facts.areaM2 || !result.facts.projectType)) {
    missing.push("BGF / area + project type, or manual gross price");
  }
  if (!result.facts.contactName) {
    missing.push("client name");
  }
  if (!result.facts.projectName) {
    missing.push("lead name");
  }
  if (!result.facts.location) {
    missing.push("project address");
  }
  return missing.length > 0 ? missing.join(", ") : null;
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

function explicitLeadQuery(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const fullCode = normalized.match(/\bL-\d{4}-\d{1,6}\b/i)?.[0];
  if (fullCode) {
    return fullCode.toUpperCase();
  }
  const shortCode =
    normalized.match(/(?:#|lead\s*|лид\s*|лиду\s*|лида\s*|к\s+)(\d{1,6})\b/i)?.[1] ??
    normalized.match(/\b0*(\d{1,6})\b/)?.[1];
  if (shortCode && /(?:#|lead|лид|лиду|лида|к\s+)\s*0*\d/i.test(normalized)) {
    return `L-2026-${shortCode.padStart(3, "0")}`;
  }
  return null;
}

function hasExplicitLeadReference(text: string): boolean {
  return Boolean(explicitLeadQuery(text));
}

function leadTargetQuery(text: string): string {
  const explicit = explicitLeadQuery(text);
  if (explicit) {
    return explicit;
  }
  return text
    .replace(/\b(this\s+is\s+)?for\b/gi, " ")
    .replace(/\bbelongs\s+to\b/gi, " ")
    .replace(/\badd\s+(this\s+)?to\b/gi, " ")
    .replace(/\battach\s+(this\s+)?to\b/gi, " ")
    .replace(/\blead\b/gi, " ")
    .replace(/(?:это\s+)?(?:для|к|ко|относится\s+к|добавь\s+к|прикрепи\s+к|прислюнь\s+к)\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveLeadFromDirectorText(
  text: string,
  deps: TelegramBotDeps
): Promise<(Pick<Lead, "id" | "name"> & Partial<Pick<Lead, "code">>) | null> {
  if (!deps.searchLeads) {
    return null;
  }
  const query = leadTargetQuery(text);
  if (!query) {
    return null;
  }
  const search = await deps.searchLeads({ workspaceId: deps.workspaceId, query, limit: 5 });
  if (search.matches.length === 0) {
    return null;
  }
  const normalizedQuery = query.toLocaleLowerCase();
  return (
    search.matches.find((match) => match.code?.toLocaleLowerCase() === normalizedQuery) ??
    search.matches.find((match) => match.name.toLocaleLowerCase() === normalizedQuery) ??
    search.matches.find((match) => match.name.toLocaleLowerCase().includes(normalizedQuery)) ??
    search.matches[0] ??
    null
  );
}

function pendingClarificationKind(result: CrmOrchestrationResult): PendingClarification["kind"] | null {
  const requestsReview = result.actions.some((action) => action.type === "request_review");
  if (!requestsReview || result.risk !== "review") {
    return null;
  }
  if (result.intent === "create_meeting" || result.actions.some((action) => action.type === "create_meeting")) {
    return "calendar";
  }
  if (result.intent === "create_reminder" || result.actions.some((action) => action.type === "create_reminder")) {
    return "reminder";
  }
  return null;
}

function resumePendingResult(
  pending: PendingClarification,
  lead: Pick<Lead, "id" | "name">
): CrmOrchestrationResult {
  const actionType = pending.kind === "calendar" ? "create_meeting" : "create_reminder";
  return {
    ...pending.result,
    risk: "auto",
    facts: {
      ...pending.result.facts,
      contactName: pending.result.facts.contactName ?? lead.name
    },
    actions: [
      {
        type: actionType,
        risk: "auto",
        reason: `Clarification selected ${lead.name}.`,
        payload: { targetId: lead.id }
      }
    ],
    explanations: [`Resumed pending ${pending.kind} clarification for ${lead.name}.`]
  };
}

async function maybeResumePendingClarification(
  message: TelegramMessage,
  text: string,
  deps: TelegramBotDeps
): Promise<Pick<Lead, "id" | "name"> | null | undefined> {
  const pending = deps.takePendingClarification?.({
    chatId: message.chat.id,
    replyToMessageId: message.reply_to_message?.message_id ?? null
  });
  if (!pending) {
    return undefined;
  }
  const targetLead = await resolveLeadFromDirectorText(text, deps);
  if (!targetLead) {
    await deps.sendMessage(message.chat.id, `I could not find a lead for: ${leadTargetQuery(text) || text.trim()}`);
    return null;
  }
  const result = resumePendingResult(pending, targetLead);
  const resumedText = [pending.orchestrationText, text.trim() ? `Clarification: ${text.trim()}` : null]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
  const resumedMessage = {
    ...message,
    message_id: pending.message.message_id,
    date: pending.message.date ?? message.date
  };
  if (pending.kind === "calendar") {
    const outcome = await maybeCreateCalendarEvent(resumedMessage, resumedText, result, targetLead.id, deps);
    return outcome.handled ? { id: targetLead.id, name: targetLead.name } : null;
  }
  const outcome = await maybeCreateReminder(resumedMessage, resumedText, result, targetLead.id, deps);
  return outcome.handled ? { id: targetLead.id, name: targetLead.name } : null;
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

const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;
const DATE_TIME_WITH_ZONE_RE = /(?:z|[+-]\d{2}:?\d{2})$/i;
const WEEKDAY_TIME_RE =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье)\b(?:\s*(?:at|around|около|в)?\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6
};

function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return zonedAsUtc - date.getTime();
}

function localDateTimeToUtcIso(value: string, timeZone: string): string | null {
  const match = LOCAL_DATE_TIME_RE.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  const localAsUtc = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  );
  const firstOffset = timeZoneOffsetMs(timeZone, localAsUtc);
  const firstUtc = new Date(localAsUtc.getTime() - firstOffset);
  const secondOffset = timeZoneOffsetMs(timeZone, firstUtc);
  return new Date(localAsUtc.getTime() - secondOffset).toISOString();
}

function datePartsInTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday ?? "");
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekday >= 0 ? weekday : date.getUTCDay()
  };
}

function addDaysToYmd(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function relativeWeekdayTimeToUtcIso(value: string, timeZone: string, referenceDate: Date): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  const match = WEEKDAY_TIME_RE.exec(normalized);
  if (!match) {
    return null;
  }
  const weekday = WEEKDAY_INDEX[match[1]!.toLocaleLowerCase()];
  if (weekday === undefined) {
    return null;
  }
  let hour = Number(match[2]);
  const minute = Number(match[3] ?? "0");
  const meridiem = match[4]?.toLocaleLowerCase();
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }
  const reference = datePartsInTimeZone(referenceDate, timeZone);
  const daysAhead = (weekday - reference.weekday + 7) % 7 || 7;
  const target = addDaysToYmd(reference.year, reference.month, reference.day, daysAhead);
  return localDateTimeToUtcIso(
    `${target.year}-${String(target.month).padStart(2, "0")}-${String(target.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    timeZone
  );
}

function messageReferenceDate(message: TelegramMessage): Date {
  return typeof message.date === "number" && Number.isFinite(message.date) ? new Date(message.date * 1000) : new Date();
}

function normalizeReminderDueAt(
  value: string,
  timeZone = process.env.LIGHTCRM_TIME_ZONE ?? "Europe/Paris",
  referenceDate = new Date()
): string | null {
  const trimmed = value.trim();
  const isoValue = DATE_TIME_WITH_ZONE_RE.test(trimmed)
    ? trimmed
    : localDateTimeToUtcIso(trimmed, timeZone) ?? relativeWeekdayTimeToUtcIso(trimmed, timeZone, referenceDate);
  if (!isoValue) {
    return null;
  }
  const date = new Date(isoValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addMinutesIso(value: string, minutes: number): string {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
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
  const dueAt = normalizeReminderDueAt(result.facts.dueAt, undefined, messageReferenceDate(message));
  if (!dueAt) {
    await deps.sendMessage(message.chat.id, `reminder date is invalid: ${result.facts.dueAt}`);
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
    dueAt,
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

async function maybeCreateCalendarEvent(
  message: TelegramMessage,
  text: string,
  result: CrmOrchestrationResult,
  replyLeadId: string | null,
  deps: TelegramBotDeps,
  options: { notify?: boolean } = {}
): Promise<{ handled: boolean; event: TelegramCalendarEventResult | null }> {
  const action = actionOfType(result, "create_meeting");
  if (!deps.createCalendarEvent || action?.type !== "create_meeting" || action.risk !== "auto") {
    return { handled: false, event: null };
  }
  if (!result.facts.dueAt) {
    await deps.sendMessage(message.chat.id, "calendar event date is missing");
    return { handled: true, event: null };
  }
  const startsAt = normalizeReminderDueAt(result.facts.dueAt, undefined, messageReferenceDate(message));
  if (!startsAt) {
    await deps.sendMessage(message.chat.id, `calendar event date is invalid: ${result.facts.dueAt}`);
    return { handled: true, event: null };
  }
  const event = await deps.createCalendarEvent({
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
    startsAt,
    endsAt: addMinutesIso(startsAt, 60),
    location: result.facts.location
  });
  if (options.notify ?? true) {
    await deps.sendMessage(
      message.chat.id,
      [
        "Calendar event created",
        `Event ID: ${event.id}`,
        replyLeadId ? `Lead ID: ${replyLeadId}` : null,
        `Starts: ${new Date(event.startsAt).toISOString()}`,
        `Ends: ${new Date(event.endsAt).toISOString()}`,
        `Title: ${event.title}`
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    );
  }
  return { handled: true, event };
}

type TelegramCallbackResult =
  | { handled: false; lead: null }
  | { handled: true; lead: Pick<Lead, "id" | "name"> | null };

export async function handleTelegramCallback(update: TelegramUpdate, deps: TelegramBotDeps): Promise<TelegramCallbackResult> {
  const callback = update.callback_query;
  if (!callback?.message) {
    return { handled: false, lead: null };
  }
  const chatId = callback.message.chat.id;
  if (deps.allowedChatIds.size > 0 && !deps.allowedChatIds.has(chatId)) {
    await deps.sendMessage(chatId, "This chat is not allowed to use this LightCrm bot.");
    return { handled: true, lead: null };
  }
  const pendingNewId = callback.data?.startsWith("attachment_new:") ? callback.data.slice("attachment_new:".length) : null;
  const pendingActiveId = callback.data?.startsWith("attachment_active:")
    ? callback.data.slice("attachment_active:".length)
    : null;
  const pendingCancelId = callback.data?.startsWith("attachment_cancel:")
    ? callback.data.slice("attachment_cancel:".length)
    : null;
  const pendingId = pendingNewId ?? pendingActiveId ?? pendingCancelId;
  if (pendingId) {
    const pending = deps.takePendingAttachmentDecision?.(pendingId) ?? null;
    if (pendingCancelId) {
      await deps.sendMessage(chatId, "decision cancelled");
      return { handled: true, lead: null };
    }
    if (!pending) {
      await deps.sendMessage(chatId, "decision expired. please resend the message if it still matters.");
      return { handled: true, lead: null };
    }
    const lead = await handleTelegramUpdate(
      { update_id: update.update_id, message: pending.message },
      {
        ...deps,
        activeLead: pendingActiveId ? pending.activeLead : null,
        forceAttachToActiveLead: Boolean(pendingActiveId),
        forceCreateNewLead: Boolean(pendingNewId)
      }
    );
    return { handled: true, lead };
  }
  if (callback.data === "crm_home") {
    if (!deps.crmAppBaseUrl) {
      await deps.sendMessage(chatId, "CRM link is not configured yet.");
      return { handled: true, lead: null };
    }
    await deps.sendMessage(chatId, deps.crmAppBaseUrl.replace(/\/$/, ""));
    return { handled: true, lead: null };
  }
  if (callback.data === "crm_search") {
    if (!deps.listRecentLeads) {
      await deps.sendMessage(chatId, "Lead search is not connected yet.");
      return { handled: true, lead: null };
    }
    const recent = await deps.listRecentLeads({ workspaceId: deps.workspaceId, limit: 6 });
    await deps.sendMessage(
      chatId,
      telegramRecentLeadsText(recent.matches),
      telegramRecentLeadsReplyMarkup(recent.matches)
    );
    return { handled: true, lead: null };
  }
  const crmShowLeadId = callback.data?.startsWith("crm_show:") ? callback.data.slice("crm_show:".length) : null;
  if (crmShowLeadId) {
    const searchProvider = deps.searchLeads ?? deps.listRecentLeads;
    if (!searchProvider) {
      await deps.sendMessage(chatId, "Lead card is not available yet.");
      return { handled: true, lead: null };
    }
    const result =
      searchProvider === deps.searchLeads
        ? await deps.searchLeads({ workspaceId: deps.workspaceId, query: crmShowLeadId, limit: 1 })
        : await deps.listRecentLeads!({ workspaceId: deps.workspaceId, limit: 20 });
    const lead = result.matches.find((match) => match.id === crmShowLeadId || match.code === crmShowLeadId) ?? result.matches[0] ?? null;
    if (!lead) {
      await deps.sendMessage(chatId, "Lead not found.");
      return { handled: true, lead: null };
    }
    const documents = deps.listLeadDocuments
      ? (await deps.listLeadDocuments({ workspaceId: deps.workspaceId, leadId: lead.id, limit: 8 })).documents
      : [];
    await deps.sendMessage(
      chatId,
      telegramLeadCardTextCompact(lead, documents),
      leadCardMessageOptions(crmLeadReplyMarkup(deps, { ...lead, summaryLong: lead.summaryLong ?? null }))
    );
    return { handled: true, lead };
  }
  const crmLeadRef = callback.data?.startsWith("crm_lead:") ? parseCrmLeadCallbackData(callback.data) : null;
  if (crmLeadRef?.id) {
    if (!deps.crmAppBaseUrl) {
      return { handled: false, lead: null };
    }
    const url = `${deps.crmAppBaseUrl.replace(/\/$/, "")}/leads?leadId=${encodeURIComponent(crmLeadRef.publicRef)}`;
    await deps.sendMessage(chatId, url);
    return { handled: true, lead: null };
  }
  const undoLeadId = callback.data?.startsWith("undo_lead:") ? callback.data.slice("undo_lead:".length) : null;
  if (undoLeadId) {
    if (!deps.archiveLead) {
      await deps.sendMessage(chatId, "undo is not connected yet");
      return { handled: true, lead: null };
    }
    await deps.archiveLead({ workspaceId: deps.workspaceId, leadId: undoLeadId });
    await deps.sendMessage(chatId, `undone: ${undoLeadId}`);
    return { handled: true, lead: null };
  }
  const undoWritePayload = callback.data?.startsWith("undo_write:") ? callback.data.slice("undo_write:".length) : null;
  if (undoWritePayload) {
    if (!deps.undoLeadIntake) {
      await deps.sendMessage(chatId, "undo for this update is not connected yet");
      return { handled: true, lead: null };
    }
    const [leadId, sourceMessageId] = undoWritePayload.split(":");
    await deps.undoLeadIntake({ workspaceId: deps.workspaceId, leadId, sourceMessageId: sourceMessageId || null });
    await deps.sendMessage(chatId, `undone update: ${leadId}`);
    return { handled: true, lead: null };
  }
  const summaryLeadId = callback.data?.startsWith("summary_lead:") ? callback.data.slice("summary_lead:".length) : null;
  if (summaryLeadId) {
    if (!deps.searchLeads) {
      await deps.sendMessage(chatId, "full summary is not available yet");
      return { handled: true, lead: null };
    }
    const search = await deps.searchLeads({ workspaceId: deps.workspaceId, query: summaryLeadId, limit: 1 });
    const lead = search.matches.find((match) => match.id === summaryLeadId) ?? search.matches[0] ?? null;
    if (!lead) {
      await deps.sendMessage(chatId, "full summary is not available yet");
      return { handled: true, lead: null };
    }
    await deps.sendMessage(
      chatId,
      telegramLeadFullSummaryTextCompact(lead),
      leadCardMessageOptions(crmLeadReplyMarkup(deps, { ...lead, summaryLong: null }))
    );
    return { handled: true, lead: null };
  }
  const downloadsLeadId = callback.data?.startsWith("downloads_lead:")
    ? callback.data.slice("downloads_lead:".length)
    : null;
  if (downloadsLeadId) {
    if (!deps.listLeadDocuments) {
      await deps.sendMessage(chatId, "downloads are not connected yet");
      return { handled: true, lead: null };
    }
    const result = await deps.listLeadDocuments({ workspaceId: deps.workspaceId, leadId: downloadsLeadId, limit: 8 });
    await deps.sendMessage(
      chatId,
      telegramLeadDownloadsText(result.documents),
      leadCardMessageOptions(telegramLeadDownloadsReplyMarkup(result.documents))
    );
    return { handled: true, lead: null };
  }
  const offerLeadId = callback.data?.startsWith("offer_lead:") ? callback.data.slice("offer_lead:".length) : null;
  if (offerLeadId) {
    if (!deps.generateOffer || !deps.sendDocument) {
      await deps.sendMessage(chatId, "offer generation is not connected yet");
      return { handled: true, lead: null };
    }
    await deps.sendMessage(chatId, "generating offer, back shortly");
    try {
      const document = await deps.generateOffer(offerLeadId);
      await deps.sendDocument(chatId, document);
    } catch (error) {
      await deps.sendMessage(chatId, formatOfferCallbackError(error, offerLeadId));
    }
    return { handled: true, lead: null };
  }
  return { handled: false, lead: null };
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: TelegramBotDeps
): Promise<Pick<Lead, "id" | "name"> | null> {
  const callbackResult = await handleTelegramCallback(update, deps);
  if (callbackResult.handled) {
    return callbackResult.lead;
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
  const contextualText = appendReplyContext(text, message.reply_to_message);
  const attachments = extractTelegramAttachments(message);
  const command = telegramCommandName(text);
  if (command === "start" || command === "help") {
    await deps.sendMessage(chatId, helpText());
    return null;
  }
  if (command === "crm") {
    await deps.sendMessage(
      chatId,
      "Open LightCrm.",
      leadCardMessageOptions(crmHomeReplyMarkup(deps))
    );
    return null;
  }
  if (command === "search") {
    if (!deps.listRecentLeads) {
      await deps.sendMessage(chatId, "Lead search is not connected yet.");
      return null;
    }
    const recent = await deps.listRecentLeads({ workspaceId: deps.workspaceId, limit: 6 });
    await deps.sendMessage(
      chatId,
      telegramRecentLeadsText(recent.matches),
      telegramRecentLeadsReplyMarkup(recent.matches)
    );
    return null;
  }
  if (command === "newlead" || command === "new_lead") {
    deps.startNewLeadMode?.(chatId);
    await deps.sendMessage(chatId, "new lead mode: send text, files, or a batch now.");
    return null;
  }
  const orchestrationText = buildOrchestrationText(message, contextualText, attachments);
  if (!text.trim() && attachments.length === 0) {
    await deps.sendMessage(chatId, "Please send text or attach files so I can save a draft lead.");
    return null;
  }

  const orchestrate = deps.orchestrate ?? runCrmOrchestration;
  const author = authorName(message.from);
  const replyLeadId = extractLeadIdFromReply(message.reply_to_message);
  const pendingClarification = await maybeResumePendingClarification(message, text, deps);
  if (pendingClarification !== undefined) {
    return pendingClarification;
  }
  const replyLead = replyLeadId ? { id: replyLeadId, name: "replied lead" } : null;
  if (attachments.length > 1) {
    await deps.sendMessage(chatId, "reviewing the files, back shortly");
  }
  const activeLead = deps.forceCreateNewLead
    ? null
    : replyLead ?? (deps.activeLead && (attachments.length > 0 || text.trim()) ? deps.activeLead : null);
  const isAttachmentOnlyActiveLead =
    Boolean(activeLead && !replyLead && !deps.forceAttachToActiveLead && !text.trim() && attachments.length > 0);
  if (isAttachmentOnlyActiveLead && activeLead) {
    if (!deps.createPendingAttachmentDecision) {
      await deps.sendMessage(
        chatId,
        `${pendingAttachmentDecisionText(activeLead)}\n\nReply to the lead card to attach, or resend with a short caption like "new lead".`
      );
      return null;
    }
    const pendingId = deps.createPendingAttachmentDecision({ message, activeLead });
    await deps.sendMessage(chatId, pendingAttachmentDecisionText(activeLead), pendingAttachmentDecisionReplyMarkup(pendingId));
    return null;
  }
  let result = activeLead
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
  if (deps.forceCreateNewLead) {
    result = forceCreateLeadResult(result);
  }
  const firstAction = result.actions[0];
  if (
    activeLead &&
    !replyLeadId &&
    !deps.forceAttachToActiveLead &&
    attachments.length === 0 &&
    text.trim() &&
    !hasExplicitLeadReference(text) &&
    firstAction?.type === "update_lead" &&
    firstAction.risk === "auto"
  ) {
    if (deps.createPendingAttachmentDecision) {
      const pendingId = deps.createPendingAttachmentDecision({ message, activeLead });
      await deps.sendMessage(chatId, pendingActiveTextDecisionText(activeLead), pendingAttachmentDecisionReplyMarkup(pendingId));
      return null;
    }
    result = activeTextUpdateReviewResult(result, activeLead);
  }
  if (result.intent === "system_help") {
    await deps.sendMessage(chatId, helpResponse("general"));
    return null;
  }
  if (await maybeSearchLeads(message, orchestrationText, result, deps)) {
    return null;
  }
  const shouldCreateLead = hasAutoAction(result, "create_lead");
  const resolvedTargetLead = replyLeadId
    ? null
    : deps.forceCreateNewLead
      ? null
      : await resolveLeadFromDirectorText(text.trim() || result.facts.contactName || "", deps);
  const targetLeadId = replyLeadId ?? resolvedTargetLead?.id ?? null;
  const standaloneCalendarEvent = shouldCreateLead
    ? { handled: false, event: null }
    : await maybeCreateCalendarEvent(message, orchestrationText, result, targetLeadId, deps);
  if (standaloneCalendarEvent.handled) {
    return replyLeadId ? { id: replyLeadId, name: "replied lead" } : resolvedTargetLead ? { id: resolvedTargetLead.id, name: resolvedTargetLead.name } : null;
  }
  const standaloneReminder = shouldCreateLead
    ? { handled: false, reminder: null }
    : await maybeCreateReminder(message, orchestrationText, result, targetLeadId, deps);
  if (standaloneReminder.handled) {
    return replyLeadId ? { id: replyLeadId, name: "replied lead" } : resolvedTargetLead ? { id: resolvedTargetLead.id, name: resolvedTargetLead.name } : null;
  }
  const updatedLead =
    deps.forceCreateNewLead || result.intent === "attach_document"
      ? null
      : await maybeUpdateLead(message, orchestrationText, author, result, targetLeadId, deps);
  const action = result.actions[0];
  const shouldAttachToActiveLead =
    Boolean(activeLead && attachments.length > 0 && action?.type !== "create_lead");
  let createdLead: Pick<Lead, "id" | "name"> | null = null;
  const lead =
    updatedLead ??
    (shouldAttachToActiveLead ? activeLead : null) ??
    (createdLead = await maybeCreateLead(message, orchestrationText, author, result, deps));
  if (lead) {
    const reminderOutcome = await maybeCreateReminder(message, orchestrationText, result, lead.id, deps, { notify: false });
    const calendarOutcome = await maybeCreateCalendarEvent(message, orchestrationText, result, lead.id, deps, { notify: false });
    const preparedAttachments =
      deps.prepareAttachment && attachments.length > 0
        ? await Promise.all(
            attachments.map((attachment, index) =>
              deps.prepareAttachment!({
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
    const enrichment = await maybeEnrichLeadFromAttachments(message, author, lead, preparedAttachments, deps);
    const replyLead = enrichment.lead;
    const replyResult = enrichment.result ?? result;
    const replyDocuments = deps.listLeadDocuments
      ? (await deps.listLeadDocuments({ workspaceId: deps.workspaceId, leadId: replyLead.id, limit: 8 })).documents
      : [];
    const shouldCreateTextOnlySummary = Boolean(createdLead);
    const intake =
      shouldCreateTextOnlySummary && preparedAttachments.length === 0 && deps.ingestLeadIntake
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
          ...replyLead,
          ...leadCardFieldsFromFacts(replyResult),
          code: optionalStringProperty(replyLead, "code"),
          status: (optionalStringProperty(replyLead, "status") as Lead["status"] | null) ?? undefined,
          summaryShort: leadCardSummaryFromResult(replyResult, intake?.summary ?? null),
          summaryLong: intake?.summary ?? null
        }, replyDocuments, createdLead ? "create" : "update"),
        reminderOutcome.reminder
          ? `Reminder: ${reminderOutcome.reminder.id} at ${new Date(reminderOutcome.reminder.dueAt).toISOString()}`
          : null,
        telegramCalendarLine(calendarOutcome.event ? [calendarOutcome.event] : []),
        crmLeadReplyMarkup(deps, replyLead, {
          includeUndo: Boolean(createdLead || updatedLead || enrichment.result),
          undoMode: createdLead ? "archive" : "write",
          undoSourceMessageId: String(message.message_id)
        })
          ? null
          : crmLeadUrl(deps, replyLead)
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
        .slice(0, 3900),
      leadCardMessageOptions(
        crmLeadReplyMarkup(deps, replyLead, {
          includeUndo: Boolean(createdLead || updatedLead || enrichment.result),
          undoMode: createdLead ? "archive" : "write",
          undoSourceMessageId: String(message.message_id)
        })
      )
    );
    return replyLead;
  }

  const sent = await deps.sendMessage(chatId, formatOrchestrationReply(result));
  const pendingKind = pendingClarificationKind(result);
  if (pendingKind && deps.createPendingClarification) {
    deps.createPendingClarification({
      chatId,
      promptMessageId: sentTelegramMessageId(sent),
      message,
      orchestrationText,
      result,
      kind: pendingKind
    });
  }
  return null;
}
