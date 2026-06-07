import type { IngestLeadIntakeInput, Lead, LeadIntakeAttachmentInput, UpsertLeadInput } from "@lightcrm/core";
import { runCrmOrchestration, type CrmOrchestrationInput, type CrmOrchestrationResult } from "@lightcrm/orchestrator";

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
};

export type TelegramBotDeps = {
  allowedChatIds: Set<number>;
  workspaceId: string;
  sendMessage: (chatId: number, text: string) => Promise<unknown> | unknown;
  orchestrate?: (input: CrmOrchestrationInput) => Promise<CrmOrchestrationResult>;
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
  const lines = [
    "LightCrm dry-run",
    `Intent: ${result.intent}`,
    `Risk: ${result.risk}`,
    `Action: ${action?.type ?? "none"}`,
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
    "Current mode: no CRM writes, only intent/facts/risk/action preview."
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
      : result.facts.contactName ?? result.facts.projectName ?? text.slice(0, 80) ?? "Telegram lead";
  return deps.createLead({
    workspaceId: deps.workspaceId,
    name,
    phone: result.facts.phone,
    company: result.facts.projectName,
    sourceChannel: "telegram",
    externalThreadId: String(message.chat.id),
    externalMessageId: String(message.message_id),
    notes: [`Telegram author: ${author ?? "unknown"}`, text].join("\n")
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
            attachments.map((attachment) =>
              deps.prepareAttachment?.({
                workspaceId: deps.workspaceId,
                leadId: lead.id,
                attachment,
                message
              })
            )
          )
        : [];
    await deps.ingestLeadIntake({
      workspaceId: deps.workspaceId,
      leadId: lead.id,
      sourceChannel: "telegram",
      sourceThreadId: String(message.chat.id),
      sourceMessageId: String(message.message_id),
      textItems: [{ sourceMessageId: String(message.message_id), author, text }],
      attachments: preparedAttachments.filter((item): item is LeadIntakeAttachmentInput => Boolean(item))
    });
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
