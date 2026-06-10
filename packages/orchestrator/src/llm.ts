import type { z } from "zod";

export type JsonLlmCallInput = {
  system: string;
  user: string;
  model: string;
  temperature: number;
};

export type JsonLlmProvider = {
  callJson(input: JsonLlmCallInput): Promise<unknown>;
};

export type RunJsonInput<T extends z.ZodTypeAny> = JsonLlmCallInput & {
  schema: T;
};

export function createJsonLlmClient(provider: JsonLlmProvider) {
  return {
    async runJson<T extends z.ZodTypeAny>(input: RunJsonInput<T>): Promise<z.infer<T>> {
      const { schema, ...callInput } = input;
      const raw = await provider.callJson(callInput);
      return schema.parse(raw);
    }
  };
}

type OpenAiJsonPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

async function readOpenAiPayload(response: Response): Promise<OpenAiJsonPayload | undefined> {
  try {
    return (await response.json()) as OpenAiJsonPayload;
  } catch {
    return undefined;
  }
}

export function createOpenAiJsonProvider(fetchImpl: typeof fetch = fetch): JsonLlmProvider {
  return {
    async callJson(input) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for semantic LangGraph mode.");
      }

      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model,
          temperature: input.temperature,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ]
        })
      });

      if (!response.ok) {
        const payload = await readOpenAiPayload(response);
        throw new Error(payload?.error?.message ?? "OpenAI JSON call failed.");
      }

      const payload = await readOpenAiPayload(response);
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI JSON call returned no content.");
      }

      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new Error("OpenAI JSON call returned invalid JSON.");
      }
    }
  };
}
