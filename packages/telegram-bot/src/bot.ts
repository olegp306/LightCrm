import { config } from "dotenv";
import { resolve } from "node:path";
import { handleTelegramUpdate, parseAllowedChatIds, type TelegramUpdate } from "./bot-core";

config({ path: resolve(process.cwd(), "../../.env") });

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

const apiBase = `https://api.telegram.org/bot${token}`;
const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram ${method} failed`);
  }
  return payload.result as T;
}

async function sendMessage(chatId: number, text: string) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function getUpdates(offset: number | undefined): Promise<TelegramUpdate[]> {
  return telegramCall("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message"]
  });
}

async function runPolling() {
  console.log(`LightCrm Telegram bot polling started. Allowed chats: ${allowedChatIds.size || "all"}.`);
  let offset: number | undefined;
  for (;;) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update, { allowedChatIds, workspaceId, sendMessage });
      }
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
