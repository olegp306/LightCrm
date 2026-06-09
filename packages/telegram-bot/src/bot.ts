import { config } from "dotenv";
import type { IngestLeadIntakeInput, LeadIntakeAttachmentInput, UpsertLeadInput } from "@lightcrm/core";
import type { CrmOrchestrationInput, CrmOrchestrationResult } from "@lightcrm/orchestrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleTelegramUpdate,
  parseAllowedChatIds,
  type PrepareTelegramAttachmentInput,
  type TelegramUpdate,
  uploadTelegramAttachmentToWeb
} from "./bot-core";

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

async function crmCall<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${crmApiBase}${path}`, {
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
    throw new Error(`Telegram file download failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function createLead(input: UpsertLeadInput) {
  return crmCall<{ id: string; name: string }>("/api/crm/leads/upsert", input);
}

async function ingestLeadIntake(input: IngestLeadIntakeInput) {
  return crmCall<{ documents?: unknown[]; summary?: string }>("/api/crm/lead-intake", input);
}

async function orchestrate(input: CrmOrchestrationInput) {
  return crmCall<CrmOrchestrationResult>("/api/crm/orchestrator/dry-run", input);
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

async function runPolling() {
  console.log(`LightCrm Telegram bot polling started. Allowed chats: ${allowedChatIds.size || "all"}.`);
  let offset: number | undefined;
  for (;;) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update, {
          allowedChatIds,
          workspaceId,
          sendMessage,
          orchestrate,
          createLead,
          ingestLeadIntake,
          prepareAttachment
        });
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
