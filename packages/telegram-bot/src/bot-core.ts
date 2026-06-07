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
  chat: { id: number };
  from?: TelegramUser;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

export type TelegramBotDeps = {
  allowedChatIds: Set<number>;
  workspaceId: string;
  sendMessage: (chatId: number, text: string) => Promise<unknown> | unknown;
  orchestrate?: (input: CrmOrchestrationInput) => Promise<CrmOrchestrationResult>;
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
  if (text === "/start" || text === "/help") {
    await deps.sendMessage(chatId, helpText());
    return;
  }
  if (!text.trim()) {
    await deps.sendMessage(chatId, "Please send text or a caption. Attachments will be connected after the file pipeline is enabled.");
    return;
  }

  const orchestrate = deps.orchestrate ?? runCrmOrchestration;
  const result = await orchestrate({
    workspaceId: deps.workspaceId,
    messageId: String(message.message_id),
    author: authorName(message.from),
    text,
    sourceChannel: "telegram"
  });
  await deps.sendMessage(chatId, formatOrchestrationReply(result));
}
