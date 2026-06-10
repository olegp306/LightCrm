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
      const raw = await provider.callJson(input);
      return input.schema.parse(raw);
    }
  };
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

      const payload = (await response.json()) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "OpenAI JSON call failed.");
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI JSON call returned no content.");
      }

      return JSON.parse(content) as unknown;
    }
  };
}
