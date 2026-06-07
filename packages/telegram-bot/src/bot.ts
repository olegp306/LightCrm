import { config } from "dotenv";
import { storeCrmFile } from "@lightcrm/storage";
import type { IngestLeadIntakeInput, LeadIntakeAttachmentInput, UpsertLeadInput } from "@lightcrm/core";
import { isAbsolute, resolve } from "node:path";
import {
  handleTelegramUpdate,
  parseAllowedChatIds,
  type PrepareTelegramAttachmentInput,
  type TelegramUpdate
} from "./bot-core";

const repoRoot = resolve(process.cwd(), "../..");
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

function storageEnv() {
  const localDir = process.env.LOCAL_STORAGE_DIR;
  return {
    ...process.env,
    LOCAL_STORAGE_DIR: localDir && !isAbsolute(localDir) ? resolve(repoRoot, localDir) : localDir
  };
}

async function createLead(input: UpsertLeadInput) {
  return crmCall<{ id: string; name: string }>("/api/crm/leads/upsert", input);
}

async function ingestLeadIntake(input: IngestLeadIntakeInput) {
  return crmCall<{ documents?: unknown[]; summary?: string }>("/api/crm/lead-intake", input);
}

async function prepareAttachment(input: PrepareTelegramAttachmentInput): Promise<LeadIntakeAttachmentInput> {
  const fileInfo = await getFile(input.attachment.fileId);
  const bytes = await downloadTelegramFile(fileInfo.file_path);
  const stored = await storeCrmFile({
    bytes,
    fileName: `${input.message.message_id}-${input.attachment.fileName}`,
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    mimeType: input.attachment.mimeType,
    env: storageEnv()
  });
  return {
    sourceMessageId: String(input.message.message_id),
    kind: input.attachment.kind,
    fileName: input.attachment.fileName,
    storageProvider: stored.storageProvider,
    storageBucket: stored.storageBucket,
    storageKey: stored.storageKey,
    downloadUrl: stored.downloadUrl,
    mimeType: stored.mimeType,
    sizeBytes: input.attachment.sizeBytes ?? stored.sizeBytes,
    summary: `${input.attachment.kind} from Telegram intake`
  };
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
