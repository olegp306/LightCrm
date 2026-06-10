import { describe, expect, it } from "vitest";
import { runCrmOrchestration } from "./graph";

function restoreOpenAiApiKey(originalApiKey: string | undefined) {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
    return;
  }

  process.env.OPENAI_API_KEY = originalApiKey;
}

describe("runCrmOrchestration", () => {
  it("routes default runtime settings through semantic mode", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await expect(
        runCrmOrchestration({
          workspaceId: "workspace-1",
          messageId: "semantic-default",
          author: "operator",
          text: "No, this is not a new lead. Add it as a note to the existing project."
        })
      ).rejects.toThrow("OPENAI_API_KEY is required for semantic LangGraph mode.");
    } finally {
      restoreOpenAiApiKey(originalApiKey);
    }
  });

  it("keeps semantic-disabled fallback in review without parsing business meaning", async () => {
    const result = await runCrmOrchestration(
      {
        workspaceId: "workspace-1",
        messageId: "legacy-fallback",
        author: "operator",
        text: "Please handle this fresh opportunity."
      },
      {
        semanticMode: false
      }
    );

    expect(result.settings.semanticMode).toBe(false);
    expect(result.intent).toBe("unknown");
    expect(result.actions[0]).toMatchObject({
      type: "request_review",
      risk: "review"
    });
    expect(result.explanations).toContain("Legacy rule parser is disabled. Enable semantic mode for CRM orchestration.");
  });
});
