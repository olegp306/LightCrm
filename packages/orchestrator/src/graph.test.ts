import { describe, expect, it } from "vitest";
import { runCrmOrchestration } from "./graph";

describe("runCrmOrchestration", () => {
  it("prioritizes explicit new lead intent over name similarity", async () => {
    const result = await runCrmOrchestration({
      workspaceId: "workspace-1",
      messageId: "1869",
      author: "Катя",
      text: "Ещё новый лид: снова Максим Тютюник, проект в Швейцарии, частный дом"
    });

    expect(result.intent).toBe("create_new_lead");
    expect(result.actions[0]).toMatchObject({
      type: "create_lead",
      risk: "auto"
    });
    expect(result.facts.contactName).toBe("Максим Тютюник");
    expect(result.facts.location).toBe("Швейцария");
    expect(result.explanations).toContain("Explicit new-lead phrase wins over similar contact names.");
    expect(result.actions[0]?.payload).toMatchObject({
      externalMessageId: "1869",
      sourceChannel: "telegram",
      evidence: {
        sourceMessageId: "1869",
        author: "Катя"
      }
    });
  });

  it("routes suspicious name-only updates to human review", async () => {
    const result = await runCrmOrchestration({
      workspaceId: "workspace-1",
      messageId: "1878",
      author: "Катя",
      text: "Имя клиента - Максим Тютюник"
    });

    expect(result.intent).toBe("update_contact");
    expect(result.actions[0]).toMatchObject({
      type: "request_review",
      risk: "review"
    });
  });

  it("does not create a lead when new-lead wording is negated", async () => {
    const result = await runCrmOrchestration({
      workspaceId: "workspace-1",
      messageId: "negated-new-lead",
      author: "Катя",
      text: "Нет, это не новый лид"
    });

    expect(result.intent).toBe("clarification");
    expect(result.actions[0]).toMatchObject({
      type: "request_review",
      risk: "review"
    });
    expect(result.actions[0]?.reason).toContain("negated");
  });

  it("keeps a potential developer without a concrete project as an opportunity", async () => {
    const result = await runCrmOrchestration({
      workspaceId: "workspace-1",
      messageId: "arthur",
      author: "Катя",
      text: "Следующего потенциального клиента-застройщика зовут Артур Grauberger. У него пока нет никакого конкретного проекта, нужно периодически фоллоу пить."
    });

    expect(result.intent).toBe("create_new_lead");
    expect(result.actions[0]).toMatchObject({
      type: "create_lead",
      risk: "auto"
    });
    expect(result.facts.contactName).toBe("Артур Grauberger");
    expect(result.facts.projectType).toBe("potential_developer");
  });

  it("plans a reminder from follow-up date messages", async () => {
    const result = await runCrmOrchestration({
      workspaceId: "workspace-1",
      messageId: "ufuk-follow-up",
      author: "Катя",
      text: "Это в понедельник в 10 утра, 8 июня"
    });

    expect(result.intent).toBe("create_reminder");
    expect(result.actions[0]).toMatchObject({
      type: "create_reminder",
      risk: "auto"
    });
    expect(result.facts.dueAt).toBe("2026-06-08T10:00:00.000Z");
  });
});
