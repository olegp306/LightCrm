import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllowedChatIds } from "./bot-core";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(repoRoot, ".env") });

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramUserResult = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type TelegramWebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
};

type SmokeCheck = {
  name: string;
  ok: boolean;
  details: string;
};

function crmApiBase(): string {
  return (process.env.LIGHTCRM_API_BASE ?? "http://localhost:4900").replace(/\/$/, "");
}

function crmAuthHeaders(): HeadersInit {
  const token = process.env.LIGHTCRM_INTERNAL_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function telegramCall<T>(token: string, method: string): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`);
  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `TG ${method} failed`);
  }
  return payload.result as T;
}

async function crmGet(path: string): Promise<unknown> {
  const response = await fetch(`${crmApiBase()}${path}`, { headers: crmAuthHeaders() });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CRM ${path} failed with ${response.status}: ${text.slice(0, 160)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function check(name: string, fn: () => Promise<string>): Promise<SmokeCheck> {
  try {
    return { name, ok: true, details: await fn() };
  } catch (error) {
    return { name, ok: false, details: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  const checks = await Promise.all([
    check("env", async () => {
      if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN is missing");
      }
      return `token present, allowed chats: ${allowedChatIds.size || "all"}`;
    }),
    check("telegram:getMe", async () => {
      if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN is missing");
      }
      const me = await telegramCall<TelegramUserResult>(token, "getMe");
      return `${me.username ?? me.first_name} (${me.is_bot ? "bot" : "user"})`;
    }),
    check("telegram:webhook", async () => {
      if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN is missing");
      }
      const info = await telegramCall<TelegramWebhookInfo>(token, "getWebhookInfo");
      const webhook = info.url ? "configured" : "empty";
      const error = info.last_error_message ? `, last error: ${info.last_error_message}` : "";
      return `${webhook}, pending updates: ${info.pending_update_count}${error}`;
    }),
    check("crm:settings", async () => {
      await crmGet("/api/crm/orchestrator/settings");
      return `${crmApiBase()} ready`;
    }),
    check("crm:leads", async () => {
      const leads = await crmGet("/api/crm/leads");
      return `lead endpoint returned ${Array.isArray(leads) ? leads.length : "non-array"} record(s)`;
    })
  ]);

  const failed = checks.filter((item) => !item.ok);
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        checks
      },
      null,
      2
    )
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
