import { extractTelegramAttachments, type TelegramUpdate } from "./bot-core";

export type MediaGroupBuffer = {
  updates: TelegramUpdate[];
  lastUpdatedAt: number;
};

export type ChatIntakeBuffer = {
  updates: TelegramUpdate[];
  lastUpdatedAt: number;
};

function messageText(update: TelegramUpdate): string {
  return update.message?.text ?? update.message?.caption ?? "";
}

function isCommand(update: TelegramUpdate): boolean {
  const text = messageText(update).trim();
  return text === "/start" || text === "/help";
}

export function combineMediaGroup(updates: TelegramUpdate[]): TelegramUpdate | null {
  const messages = updates
    .map((update) => update.message)
    .filter((message): message is NonNullable<TelegramUpdate["message"]> => Boolean(message));
  const first = messages[0];
  if (!first) {
    return null;
  }
  const text = messages.map((message) => message.text ?? message.caption ?? "").find((value) => value.trim()) ?? "";
  return {
    update_id: Math.min(...updates.map((update) => update.update_id)),
    message: {
      ...first,
      text,
      caption: undefined,
      groupedAttachments: messages.flatMap((message) => extractTelegramAttachments(message))
    }
  };
}

export function combineChatIntake(updates: TelegramUpdate[]): TelegramUpdate | null {
  const messages = updates
    .map((update) => update.message)
    .filter((message): message is NonNullable<TelegramUpdate["message"]> => Boolean(message));
  const first = messages[0];
  if (!first) {
    return null;
  }
  const text = messages
    .map((message) => message.text ?? message.caption ?? "")
    .filter((value) => value.trim())
    .join("\n\n");
  return {
    update_id: Math.min(...updates.map((update) => update.update_id)),
    message: {
      ...first,
      text,
      caption: undefined,
      groupedAttachments: messages.flatMap((message) => extractTelegramAttachments(message))
    }
  };
}

export function collectReadyMediaGroupUpdates(
  updates: TelegramUpdate[],
  mediaGroups: Map<string, MediaGroupBuffer>,
  flushAfterMs: number,
  now = Date.now()
): TelegramUpdate[] {
  const ready: TelegramUpdate[] = [];
  for (const update of updates) {
    const message = update.message;
    if (!message?.media_group_id) {
      ready.push(update);
      continue;
    }
    const key = `${message.chat.id}:${message.media_group_id}`;
    const current = mediaGroups.get(key);
    mediaGroups.set(key, {
      updates: [...(current?.updates ?? []), update],
      lastUpdatedAt: now
    });
  }

  for (const [key, group] of mediaGroups.entries()) {
    if (now - group.lastUpdatedAt < flushAfterMs) {
      continue;
    }
    const combined = combineMediaGroup(group.updates);
    if (combined) {
      ready.push(combined);
    }
    mediaGroups.delete(key);
  }

  return ready.sort((left, right) => left.update_id - right.update_id);
}

export function collectReadyChatIntakeUpdates(
  updates: TelegramUpdate[],
  chatIntakes: Map<string, ChatIntakeBuffer>,
  flushAfterMs: number,
  now = Date.now()
): TelegramUpdate[] {
  const ready: TelegramUpdate[] = [];
  for (const update of updates) {
    const message = update.message;
    if (!message || isCommand(update)) {
      ready.push(update);
      continue;
    }
    const key = String(message.chat.id);
    const current = chatIntakes.get(key);
    chatIntakes.set(key, {
      updates: [...(current?.updates ?? []), update],
      lastUpdatedAt: now
    });
  }

  for (const [key, group] of chatIntakes.entries()) {
    if (now - group.lastUpdatedAt < flushAfterMs) {
      continue;
    }
    const combined = combineChatIntake(group.updates);
    if (combined) {
      ready.push(combined);
    }
    chatIntakes.delete(key);
  }

  return ready.sort((left, right) => left.update_id - right.update_id);
}
