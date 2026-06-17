import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseJson } from "../../_shared";
import {
  getCrmRuntimeSettings,
  updateCrmRuntimeSettings,
  type OutreachCampaignSettings
} from "../../settings/crm-settings-store";

export const dynamic = "force-dynamic";

const CreateCampaignInput = z.object({
  metaprompt: z.string().trim().min(80, "Metaprompt is too short to create an outreach campaign.")
});

const LlmTouchpoint = z.object({
  touchNumber: z.coerce.number().int().min(1).max(20),
  dayOffset: z.coerce.number().int().min(0).max(365),
  channel: z.enum(["email", "linkedin", "phone"]),
  title: z.string().trim().min(1).max(90),
  action: z.string().trim().min(1).max(600),
  subject: z.string().trim().max(180).optional().nullable(),
  body: z.string().trim().max(5000).optional().nullable()
});

const LlmCampaign = z.object({
  name: z.string().trim().min(1).max(90),
  goal: z.string().trim().min(1).max(320),
  summary: z.string().trim().min(1).max(360),
  touchpoints: z.array(LlmTouchpoint).min(1).max(12)
});

type OpenAiJsonPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textFrom(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function numberFrom(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const match = value.match(/\d+/);
      if (match) {
        return Number(match[0]);
      }
    }
  }
  return null;
}

function arrayFrom(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function unwrapCampaignJson(value: unknown): Record<string, unknown> {
  let current = asRecord(value) ?? {};
  const campaigns = current.campaigns;
  if (Array.isArray(campaigns) && campaigns.length > 0) {
    current = asRecord(campaigns[0]) ?? current;
  }
  for (const key of ["campaign", "outreachCampaign", "outreach_campaign", "data", "result"]) {
    const nested = asRecord(current[key]);
    if (nested) {
      current = nested;
      break;
    }
  }
  return current;
}

function normalizeChannel(value: string | null): "email" | "linkedin" | "phone" {
  const normalized = (value ?? "").toLocaleLowerCase();
  if (normalized.includes("linkedin")) {
    return "linkedin";
  }
  if (normalized.includes("phone") || normalized.includes("call") || normalized.includes("telefon")) {
    return "phone";
  }
  return "email";
}

function cleanPromptTitle(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/[_#]+/g, " ")
    .replace(/\bSYSTEM PROMPT\b/gi, "")
    .replace(/\bROLE\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function limitText(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}

function inferCampaignName(metaprompt: string): string {
  const heading = metaprompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s*\S/.test(line));
  return cleanPromptTitle(heading ?? "Outreach Campaign") || "Outreach Campaign";
}

function inferCampaignGoal(metaprompt: string): string {
  const objective = metaprompt.match(/(?:objective|goal|ziel)\s*(?:is|:)?\s*([^\n]+)/i)?.[1]?.trim();
  if (objective) {
    return objective.slice(0, 320);
  }
  return "Run a structured outreach cadence from the supplied metaprompt and move qualified replies into CRM follow-up.";
}

function normalizeTouchpoint(raw: unknown, index: number): z.input<typeof LlmTouchpoint> {
  const record = asRecord(raw) ?? {};
  const template = asRecord(record.template) ?? asRecord(record.emailTemplate) ?? asRecord(record.email_template) ?? {};
  const channel = normalizeChannel(textFrom(record, ["channel", "type", "medium", "touchType", "touch_type"]));
  const title =
    textFrom(record, ["title", "name", "touchTitle", "touch_title", "step", "label"]) ??
    textFrom(template, ["title", "name"]) ??
    `${channel === "phone" ? "Phone" : channel === "linkedin" ? "LinkedIn" : "Email"} touch ${index + 1}`;
  const action =
    textFrom(record, ["action", "instruction", "task", "description", "purpose", "objective"]) ??
    textFrom(template, ["action", "description"]) ??
    `Prepare ${title}.`;
  const subject = textFrom(record, ["subject", "emailSubject", "email_subject"]) ?? textFrom(template, ["subject"]);
  const body =
    textFrom(record, ["body", "emailBody", "email_body", "draft", "templateBody", "template_body"]) ??
    textFrom(template, ["body", "draft", "text"]);

  return {
    touchNumber: numberFrom(record, ["touchNumber", "touch_number", "touch", "number", "index"]) ?? index + 1,
    dayOffset: numberFrom(record, ["dayOffset", "day_offset", "day", "offset", "d", "daysAfterStart"]) ?? index * 7,
    channel,
    title: limitText(title, 90) ?? `Touch ${index + 1}`,
    action: limitText(action, 600) ?? `Prepare touch ${index + 1}.`,
    subject: limitText(subject, 180),
    body: limitText(body, 5000)
  };
}

function normalizeCampaignJson(value: unknown, metaprompt: string): z.input<typeof LlmCampaign> {
  const campaign = unwrapCampaignJson(value);
  const rawTouchpoints = arrayFrom(campaign, ["touchpoints", "touches", "steps", "cadence", "sequence"]);
  const touchpoints = rawTouchpoints.map(normalizeTouchpoint);
  const name = textFrom(campaign, ["name", "campaignName", "campaign_name", "title"]) ?? inferCampaignName(metaprompt);
  const goal = textFrom(campaign, ["goal", "objective", "purpose"]) ?? inferCampaignGoal(metaprompt);
  const summary =
    textFrom(campaign, ["summary", "shortSummary", "short_summary", "description"]) ??
    `${touchpoints.length} touches over ${Math.max(...touchpoints.map((touch) => Number(touch.dayOffset) || 0), 0)} days.`;

  return {
    name: limitText(name, 90) ?? "Outreach Campaign",
    goal: limitText(goal, 320) ?? inferCampaignGoal(metaprompt),
    summary: limitText(summary, 360) ?? `${touchpoints.length} touches.`,
    touchpoints
  };
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "campaign";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function slugify(value: string) {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "outreach-campaign";
}

function uniqueCampaignId(name: string, campaigns: OutreachCampaignSettings[]) {
  const base = slugify(name);
  const existing = new Set(campaigns.map((campaign) => campaign.id));
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

async function readOpenAiPayload(response: Response): Promise<OpenAiJsonPayload | undefined> {
  try {
    return (await response.json()) as OpenAiJsonPayload;
  } catch {
    return undefined;
  }
}

async function createCampaignWithLlm(metaprompt: string): Promise<z.infer<typeof LlmCampaign>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to create an outreach campaign from a metaprompt.");
  }
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const system = [
    "You create CRM outreach campaign definitions from user metaprompts.",
    "Return only valid JSON with keys: name, goal, summary, touchpoints.",
    "Each touchpoint must include touchNumber, dayOffset, channel, title, action.",
    "For email touchpoints also include subject and body.",
    "Use German business Sie tone when writing email bodies unless the metaprompt explicitly says otherwise.",
    "Keep email bodies review-ready, concise, and suitable for manual sending.",
    "Do not invent facts about a target. Use {{salutation}} and {{persona_hook}} placeholders when personalization is needed."
  ].join("\n");
  const user = [
    "Create one outreach campaign from this metaprompt.",
    "The output will be stored in CRM settings, so make it complete and practical.",
    "Metaprompt:",
    metaprompt
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  const payload = await readOpenAiPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI failed to create outreach campaign.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no campaign JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid campaign JSON.");
  }
  const normalized = normalizeCampaignJson(parsed, metaprompt);
  const campaign = LlmCampaign.safeParse(normalized);
  if (!campaign.success) {
    throw new Error(`Campaign JSON validation failed: ${formatZodIssues(campaign.error)}`);
  }
  return campaign.data;
}

function campaignFromLlm(
  campaign: z.infer<typeof LlmCampaign>,
  metaprompt: string,
  existingCampaigns: OutreachCampaignSettings[]
): OutreachCampaignSettings {
  const templates: OutreachCampaignSettings["templates"] = [];
  const touchpoints = campaign.touchpoints
    .slice()
    .sort((left, right) => left.dayOffset - right.dayOffset || left.touchNumber - right.touchNumber)
    .map((touch, index) => {
      const touchNumber = index + 1;
      const templateId = touch.channel === "email" ? `t${touchNumber}` : undefined;
      if (templateId) {
        templates.push({
          id: templateId,
          subject: touch.subject?.trim() || touch.title,
          body:
            touch.body?.trim() ||
            "Guten Tag {{salutation}},\n\n{{persona_hook}}\n\nIch wollte kurz anfragen, ob ein kurzer Austausch fuer Sie sinnvoll waere."
        });
      }
      return {
        id: `touch-${touchNumber}-${slugify(touch.title)}`,
        touchNumber,
        dayOffset: touch.dayOffset,
        channel: touch.channel,
        title: touch.title,
        action: touch.action,
        ...(templateId ? { templateId } : {})
      };
    });

  return {
    id: uniqueCampaignId(campaign.name, existingCampaigns),
    name: campaign.name,
    status: "draft",
    goal: campaign.goal,
    summary: campaign.summary,
    prompt: metaprompt,
    touchpoints,
    templates
  };
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, CreateCampaignInput);
    const current = await getCrmRuntimeSettings();
    const llmCampaign = await createCampaignWithLlm(input.metaprompt);
    const campaign = campaignFromLlm(llmCampaign, input.metaprompt, current.outreachCampaigns.campaigns);
    const settings = await updateCrmRuntimeSettings({
      ...current,
      outreachCampaigns: {
        ...current.outreachCampaigns,
        campaigns: [...current.outreachCampaigns.campaigns, campaign]
      }
    });
    return NextResponse.json({ campaign, settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
