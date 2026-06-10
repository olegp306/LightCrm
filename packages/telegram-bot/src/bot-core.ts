import type {
  Client,
  IngestLeadIntakeInput,
  Lead,
  LeadIntakeAttachmentInput,
  UpsertClientInput,
  UpsertLeadInput
} from "@lightcrm/core";
import { runCrmOrchestration, type CrmOrchestrationInput, type CrmOrchestrationResult } from "@lightcrm/orchestrator";
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
  document?: TelegramFile;
  voice?: TelegramFile;
  audio?: TelegramFile;
  photo?: TelegramPhotoSize[];
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
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
  sendMessage: (chatId: number, text: string) => Promise<unknown> | unknown;
  orchestrate?: (input: CrmOrchestrationInput) => Promise<CrmOrchestrationResult>;
  createClient?: (input: UpsertClientInput) => Promise<Pick<Client, "id" | "name">>;
  createLead?: (input: UpsertLeadInput) => Promise<Pick<Lead, "id" | "name">>;
  ingestLeadIntake?: (input: IngestLeadIntakeInput) => Promise<{ documents?: unknown[]; summary?: string }>;
  prepareAttachment?: (input: PrepareTelegramAttachmentInput) => Promise<LeadIntakeAttachmentInput>;
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

export function formatOrchestrationReply(result: CrmOrchestrationResult): string {
  const action = result.actions[0];
  const payload = action?.payload && typeof action.payload === "object" ? action.payload : null;
  const targetId = payload && "targetId" in payload ? payload.targetId : null;
  const lines = [
    "LightCrm dry-run",
    `Intent: ${result.intent}`,
    `Risk: ${result.risk}`,
    `Action: ${action?.type ?? "none"}`,
    targetId ? `Target: ${String(targetId)}` : null,
    `Contact: ${shortValue(result.facts.contactName)}`,
    `Project type: ${shortValue(result.facts.projectType)}`,
    `Location: ${shortValue(result.facts.location)}`,
    `Due: ${shortValue(result.facts.dueAt)}`,
    `Evidence: ${shortValue(result.facts.evidence.sourceMessageId)}`,
    action?.reason ? `Reason: ${action.reason}` : null,
    result.explanations[0] ? `Note: ${result.explanations[0]}` : null
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n").slice(0, 3900);
}

function helpText(): string {
  return [
    "LightCrm bot is running.",
    "Send a lead/update/reminder message and I will return a LangGraph dry-run plan.",
    "Current mode: auto-safe lead/client writes are enabled; review-risk actions stay as previews."
  ].join("\n");
}

function pickPhoto(message: TelegramMessage): TelegramPhotoSize | null {
  return [...(message.photo ?? [])].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

export function extractTelegramAttachments(message: TelegramMessage): TelegramAttachment[] {
  const attachments: TelegramAttachment[] = [];
  if (message.document) {
    attachments.push({
      fileId: message.document.file_id,
      uniqueId: message.document.file_unique_id ?? null,
      kind: message.document.mime_type === "application/pdf" ? "pdf" : "document",
      fileName: message.document.file_name ?? `telegram-document-${message.message_id}`,
      mimeType: message.document.mime_type ?? null,
      sizeBytes: message.document.file_size ?? null
    });
  }
  if (message.voice) {
    attachments.push({
      fileId: message.voice.file_id,
      uniqueId: message.voice.file_unique_id ?? null,
      kind: "voice",
      fileName: message.voice.file_name ?? `telegram-voice-${message.message_id}.ogg`,
      mimeType: message.voice.mime_type ?? "audio/ogg",
      sizeBytes: message.voice.file_size ?? null
    });
  }
  if (message.audio) {
    attachments.push({
      fileId: message.audio.file_id,
      uniqueId: message.audio.file_unique_id ?? null,
      kind: "audio",
      fileName: message.audio.file_name ?? `telegram-audio-${message.message_id}`,
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
      fileName: `telegram-photo-${message.message_id}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: photo.file_size ?? null
    });
  }
  return attachments;
}

function actionPayload(result: CrmOrchestrationResult): Record<string, unknown> {
  const payload = result.actions[0]?.payload;
  return payload && typeof payload === "object" ? payload : {};
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
  return fallbackText.slice(0, 80) || "Telegram lead";
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
  form.set("summary", `${input.attachment.kind} from Telegram intake`);
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
    summary: `${input.attachment.kind} from Telegram intake`
  };
}

async function maybeCreateLead(
  message: TelegramMessage,
  text: string,
  author: string | null,
  result: CrmOrchestrationResult,
  deps: TelegramBotDeps
): Promise<Pick<Lead, "id" | "name"> | null> {
  const action = result.actions[0];
  if (!deps.createLead || action?.type !== "create_lead" || action.risk !== "auto") {
    return null;
  }
  const payload = actionPayload(result);
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
          notes: [`Telegram author: ${author ?? "unknown"}`, ...crmNoteFields(result, text)].join("\n\n")
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
    notes: [`Telegram author: ${author ?? "unknown"}`, ...crmNoteFields(result, text)].join("\n\n")
  });
}

export async function handleTelegramUpdate(update: TelegramUpdate, deps: TelegramBotDeps): Promise<void> {
  const message = update.message;
  if (!message) {
    return;
  }

  const chatId = message.chat.id;
  if (deps.allowedChatIds.size > 0 && !deps.allowedChatIds.has(chatId)) {
    await deps.sendMessage(chatId, "This chat is not allowed to use this LightCrm bot.");
    return;
  }

  const text = message.text ?? message.caption ?? "";
  const attachments = extractTelegramAttachments(message);
  if (text === "/start" || text === "/help") {
    await deps.sendMessage(chatId, helpText());
    return;
  }
  if (!text.trim() && attachments.length === 0) {
    await deps.sendMessage(chatId, "Please send text or a caption. Attachments will be connected after the file pipeline is enabled.");
    return;
  }
  if (!text.trim()) {
    await deps.sendMessage(chatId, "Please add a caption or forward the context with this attachment so I can link it to the right lead.");
    return;
  }

  const orchestrate = deps.orchestrate ?? runCrmOrchestration;
  const author = authorName(message.from);
  const result = await orchestrate({
    workspaceId: deps.workspaceId,
    messageId: String(message.message_id),
    author,
    text,
    sourceChannel: "telegram"
  });
  const lead = await maybeCreateLead(message, text, author, result, deps);
  if (lead && deps.ingestLeadIntake) {
    const preparedAttachments =
      deps.prepareAttachment && attachments.length > 0
        ? await Promise.all(
            attachments.map((attachment, index) =>
              deps.prepareAttachment?.({
                workspaceId: deps.workspaceId,
                leadId: lead.id,
                attachment,
                message,
                text: index === 0 ? text : "",
                author
              })
            )
          )
        : [];
    if (preparedAttachments.length === 0) {
      await deps.ingestLeadIntake({
        workspaceId: deps.workspaceId,
        leadId: lead.id,
        sourceChannel: "telegram",
        sourceThreadId: String(message.chat.id),
        sourceMessageId: String(message.message_id),
        textItems: [{ sourceMessageId: String(message.message_id), author, text }],
        attachments: []
      });
    }
    await deps.sendMessage(
      chatId,
      [formatOrchestrationReply(result), `Intake: saved ${preparedAttachments.length} attachment(s) to ${lead.name}.`]
        .join("\n")
        .slice(0, 3900)
    );
    return;
  }

  await deps.sendMessage(chatId, formatOrchestrationReply(result));
}
