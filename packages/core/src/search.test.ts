import { describe, expect, it } from "vitest";
import { createCrmService, MemoryCrmRepository } from "./index";

describe("global search", () => {
  it("searches clients, leads, cold targets, reminders, and calendar events in one call", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    await crm.upsertClient({ workspaceId: "workspace-1", name: "Northwind Studio", company: "Northwind" });
    await crm.upsertLead({ workspaceId: "workspace-1", name: "Maria Lead", company: "Northwind" });
    await crm.upsertColdTarget({ workspaceId: "workspace-1", name: "Outbound Prospect", company: "Northwind" });
    await crm.upsertReminder({
      workspaceId: "workspace-1",
      title: "Follow up with Northwind",
      dueAt: new Date("2026-06-08T09:00:00.000Z")
    });
    await crm.upsertCalendarEvent({
      workspaceId: "workspace-1",
      title: "Northwind intro call",
      startsAt: new Date("2026-06-09T09:00:00.000Z"),
      endsAt: new Date("2026-06-09T10:00:00.000Z")
    });

    const results = await crm.globalSearch({ workspaceId: "workspace-1", query: "northwind" });

    expect(results.map((result) => result.entity)).toEqual([
      "client",
      "lead",
      "coldTarget",
      "reminder",
      "calendarEvent"
    ]);
  });
});

