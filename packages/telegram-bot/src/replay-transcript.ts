import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleTelegramUpdate, parseAllowedChatIds, type TelegramUpdate } from "./bot-core";
import type { CrmOrchestrationInput, CrmOrchestrationResult } from "@lightcrm/orchestrator";
import type { Client, IngestLeadIntakeInput, Lead, UpsertClientInput, UpsertLeadInput } from "@lightcrm/core";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(repoRoot, ".env") });

type ReplayCase = {
  messageId: number;
  text: string;
  firstLine: string;
};

type ReplaySummary = {
  messageId: number;
  firstLine: string;
  reply: string;
  orchestration: Pick<CrmOrchestrationResult, "intent" | "risk" | "actions" | "facts" | "explanations">;
  createdLead: Pick<Lead, "id" | "name"> | null;
};

function chronologicalSection(source: string) {
  const start = source.indexOf("CHRONOLOGICAL CONVERSATION");
  const end = source.indexOf("CURRENT PROD LEADS SNAPSHOT");
  return source.slice(start === -1 ? 0 : start, end === -1 ? source.length : end);
}

function extractReplayCases(source: string): ReplayCase[] {
  const section = chronologicalSection(source);
  const cases: ReplayCase[] = [];
  const marker = "rawInput / reusable test material:";
  const markerPattern = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");

  for (const match of section.matchAll(markerPattern)) {
    const rawIndex = match.index ?? -1;
    const prefix = section.slice(0, rawIndex);
    const messageMatches = [...prefix.matchAll(/messageId:\s*(\d+)/g)];
    const messageId = Number(messageMatches.at(-1)?.[1]);
    if (!Number.isSafeInteger(messageId)) {
      continue;
    }

    const afterMarker = section.slice(rawIndex + marker.length);
    const nextEventIndex = afterMarker.search(/\r?\n---\r?\n/);
    const rawText = afterMarker.slice(0, nextEventIndex === -1 ? afterMarker.length : nextEventIndex).trim();
    if (!rawText) {
      continue;
    }
    cases.push({
      messageId,
      text: rawText,
      firstLine: rawText.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ""
    });
  }

  return cases;
}

async function crmPost<T>(path: string, body: unknown): Promise<T> {
  const crmApiBase = process.env.LIGHTCRM_API_BASE ?? "http://localhost:4900";
  const token = process.env.LIGHTCRM_INTERNAL_API_TOKEN;
  const response = await fetch(`${crmApiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `LightCrm API ${path} failed`);
  }
  return payload as T;
}

async function crmGet<T>(path: string): Promise<T> {
  const crmApiBase = process.env.LIGHTCRM_API_BASE ?? "http://localhost:4900";
  const token = process.env.LIGHTCRM_INTERNAL_API_TOKEN;
  const response = await fetch(`${crmApiBase}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `LightCrm API ${path} failed`);
  }
  return payload as T;
}

async function main() {
  const transcriptPath = process.argv[2];
  if (!transcriptPath) {
    throw new Error("Usage: tsx src/replay-transcript.ts <transcript-path>");
  }

  const source = await readFile(transcriptPath, "utf8");
  const cases = extractReplayCases(source);
  const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";
  const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  const sentReplies: Array<{ chatId: number; text: string }> = [];
  const summaries: ReplaySummary[] = [];

  for (const item of cases) {
    const orchestrationResults: CrmOrchestrationResult[] = [];
    let createdLead: Pick<Lead, "id" | "name"> | null = null;
    const update: TelegramUpdate = {
      update_id: item.messageId,
      message: {
        message_id: item.messageId,
        text: item.text,
        chat: { id: 763604722 },
        from: { first_name: "Katia", last_name: "Reyzbikh", username: "Katikorsok" }
      }
    };

    try {
      await handleTelegramUpdate(update, {
        allowedChatIds,
        workspaceId,
        sendMessage: async (chatId, text) => {
          sentReplies.push({ chatId, text });
        },
        orchestrate: async (input: CrmOrchestrationInput) => {
          const result = await crmPost<CrmOrchestrationResult>("/api/crm/orchestrator/dry-run", input);
          orchestrationResults.push(result);
          return result;
        },
        createClient: async (input: UpsertClientInput) => crmPost<Pick<Client, "id" | "name">>("/api/crm/clients/upsert", input),
        createLead: async (input: UpsertLeadInput) => {
          createdLead = await crmPost<Pick<Lead, "id" | "name">>("/api/crm/leads/upsert", input);
          return createdLead;
        },
        ingestLeadIntake: async (_input: IngestLeadIntakeInput) => ({ documents: [], summary: "Replay intake without binary attachments." })
      });
    } catch (error) {
      throw new Error(
        `Replay failed for message ${item.messageId} (${item.firstLine}): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const reply = sentReplies.at(-1)?.text ?? "";
    const orchestration = orchestrationResults.at(-1);
    if (!orchestration) {
      throw new Error(`No orchestration result captured for ${item.messageId}`);
    }
    summaries.push({
      messageId: item.messageId,
      firstLine: item.firstLine,
      reply,
      orchestration: {
        intent: orchestration.intent,
        risk: orchestration.risk,
        actions: orchestration.actions,
        facts: orchestration.facts,
        explanations: orchestration.explanations
      },
      createdLead
    });
  }

  const [leads, clients] = await Promise.all([crmGet<unknown[]>("/api/crm/leads"), crmGet<unknown[]>("/api/crm/clients")]);

  console.log(
    JSON.stringify(
      {
        cases: summaries,
        totals: {
          replayed: summaries.length,
          autoCreated: summaries.filter((item) => item.createdLead).length,
          leads: leads.length,
          clients: clients.length
        },
        leads,
        clients
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
