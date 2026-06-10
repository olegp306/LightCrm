import type { OrchestrationContext, OrchestrationContextInput } from "./types";

export async function buildOrchestrationContext(input: OrchestrationContextInput): Promise<OrchestrationContext> {
  const recentLeads = (input.recentLeads ?? []).map((lead) => ({ ...lead }));
  const recentMessages = (input.recentMessages ?? []).map((message) => ({ ...message }));

  return {
    source: input.input,
    recentLeads,
    recentMessages,
    relationshipHints:
      recentLeads.length > 0 || recentMessages.length > 0 ? ["Recent CRM activity is available for context."] : []
  };
}

export function contextToPrompt(context: OrchestrationContext): string {
  return JSON.stringify(
    {
      message: context.source,
      recentLeads: context.recentLeads,
      recentMessages: context.recentMessages,
      relationshipHints: context.relationshipHints
    },
    null,
    2
  );
}
