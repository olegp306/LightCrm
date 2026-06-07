import { describe, expect, it, vi } from "vitest";
import { formatOrchestrationReply, handleTelegramUpdate, parseAllowedChatIds } from "./bot-core";

describe("telegram bot core", () => {
  it("parses allowed chat ids from comma-separated env", () => {
    expect(parseAllowedChatIds("111111, 222222")).toEqual(new Set([111111, 222222]));
    expect(parseAllowedChatIds("")).toEqual(new Set());
  });

  it("formats a concise orchestration reply", () => {
    const reply = formatOrchestrationReply({
      workspaceId: "default",
      normalizedText: "Ещё новый лид: снова Максим Тютюник",
      intent: "create_new_lead",
      risk: "auto",
      explanations: ["Explicit new-lead phrase wins over similar contact names."],
      facts: {
        contactName: "Максим Тютюник",
        projectName: null,
        projectType: "private_house",
        location: "Швейцария",
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "1869",
        evidence: {
          sourceMessageId: "1869",
          author: "Катя",
          sourceChannel: "telegram",
          textSnippet: "Ещё новый лид: снова Максим Тютюник"
        }
      },
      actions: [
        {
          type: "create_lead",
          risk: "auto",
          reason: "Low-risk CRM action.",
          payload: { externalMessageId: "1869" }
        }
      ]
    });

    expect(reply).toContain("Intent: create_new_lead");
    expect(reply).toContain("Risk: auto");
    expect(reply).toContain("Action: create_lead");
    expect(reply).toContain("Contact: Максим Тютюник");
  });

  it("rejects messages from chats outside the allowlist", async () => {
    const sendMessage = vi.fn();
    await handleTelegramUpdate(
      {
        update_id: 1,
        message: {
          message_id: 10,
          text: "Привет",
          chat: { id: 123 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate: vi.fn()
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(123, expect.stringContaining("not allowed"));
  });

  it("runs orchestration for allowed text messages", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Имя клиента - Максим Тютюник",
      intent: "update_contact",
      risk: "review",
      explanations: [],
      facts: {
        contactName: "Максим Тютюник",
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "1878",
        evidence: { sourceMessageId: "1878", author: "Katya", sourceChannel: "telegram", textSnippet: "Имя клиента" }
      },
      actions: [{ type: "request_review", risk: "review", reason: "Name-only update", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 2,
        message: {
          message_id: 1878,
          text: "Имя клиента - Максим Тютюник",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate
      }
    );

    expect(orchestrate).toHaveBeenCalledWith({
      workspaceId: "default",
      messageId: "1878",
      author: "Katya",
      text: "Имя клиента - Максим Тютюник",
      sourceChannel: "telegram"
    });
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("Risk: review"));
  });
});
