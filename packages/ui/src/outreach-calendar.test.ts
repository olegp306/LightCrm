import { describe, expect, it } from "vitest";
import { outreachDetailsForReminder } from "./outreach-calendar";

describe("outreach details for calendar reminders", () => {
  it("keeps a cold outreach reminder actionable without a parsed email draft", () => {
    const details = outreachDetailsForReminder(
      {
        sourceChannel: "outreach-campaign",
        coldTargetId: "cold-1",
        description: "Campaign imported from legacy data",
        title: "Touch 2: LinkedIn connection - Example GmbH"
      },
      new Map([["cold-1", { email: "target@example.com" }]]),
      []
    );

    expect(details).toMatchObject({
      campaignId: "Campaign imported from legacy data",
      campaignName: "Campaign imported from legacy data",
      touchNumber: 2,
      touchTitle: "LinkedIn connection",
      email: "target@example.com"
    });
  });

  it("does not classify an ordinary reminder as outreach", () => {
    expect(
      outreachDetailsForReminder(
        {
          sourceChannel: "manual",
          coldTargetId: "cold-1",
          description: "Call back next week",
          title: "Call back"
        },
        new Map([["cold-1", { email: "target@example.com" }]]),
        []
      )
    ).toBeNull();
  });
});
