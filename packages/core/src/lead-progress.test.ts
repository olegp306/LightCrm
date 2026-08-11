import { describe, expect, it } from "vitest";
import { createCrmService, MemoryCrmRepository } from "./index";

describe("lead progress persistence", () => {
  it("defaults leads to progress stage 0 with empty Katya metadata", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    const lead = await crm.upsertLead({
      workspaceId: "workspace-1",
      name: "Default lead"
    });

    expect(lead.progressStage).toBe(0);
    expect(lead.preferredLanguage).toBeNull();
    expect(lead.contractNumber).toBeNull();
    expect(lead.expectedFeeNet).toBeNull();
    expect(lead.olegPercent).toBe(2);
    expect(lead.olegCommissionEnabled).toBe(true);
    expect(lead.handoffNote).toBeNull();
    expect(lead.lastPingAt).toBeNull();
    expect(lead.clientType).toBeNull();
  });

  it("persists progress stage and Katya metadata on leads", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const lastPingAt = new Date("2026-08-10T09:30:00.000Z");

    const lead = await crm.upsertLead({
      workspaceId: "workspace-1",
      name: "Stage four lead",
      progressStage: 4,
      preferredLanguage: "de",
      contractNumber: "CTR-204",
      expectedFeeNet: 12500,
      olegPercent: 22.5,
      olegCommissionEnabled: true,
      handoffNote: "Hand off after permit call.",
      lastPingAt,
      clientType: "private"
    });

    expect(lead).toMatchObject({
      progressStage: 4,
      preferredLanguage: "de",
      contractNumber: "CTR-204",
      expectedFeeNet: 12500,
      olegPercent: 22.5,
      olegCommissionEnabled: true,
      handoffNote: "Hand off after permit call.",
      clientType: "private"
    });
    expect(lead.lastPingAt?.toISOString()).toBe(lastPingAt.toISOString());

    const stored = await repository.get("lead", lead.id);
    expect(stored).not.toBeNull();
    expect(stored?.progressStage).toBe(4);
    expect(stored?.lastPingAt?.toISOString()).toBe(lastPingAt.toISOString());
  });

  it("rejects progress stages outside the supported 0..7 range", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    await expect(
      crm.upsertLead({
        workspaceId: "workspace-1",
        name: "Too low",
        progressStage: -1
      })
    ).rejects.toThrow("Lead progress stage must be an integer between 0 and 7.");

    await expect(
      crm.upsertLead({
        workspaceId: "workspace-1",
        name: "Too high",
        progressStage: 8
      })
    ).rejects.toThrow("Lead progress stage must be an integer between 0 and 7.");
  });
});
