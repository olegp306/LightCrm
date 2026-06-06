import { describe, expect, it } from "vitest";
import { mapLeadCsvRow } from "./csv-leads";

describe("mapLeadCsvRow", () => {
  it("maps CRM CSV columns into linked client and lead upserts", () => {
    expect(
      mapLeadCsvRow(
        {
          Client: "Max",
          Project: "Architecture project",
          Email: "max@example.com",
          Phone: "+49123",
          Messenger: "Telegram",
          Source: "telegram",
          "Lead ID": "L-1",
          "Lead name": "Swiss lead",
          "Client ID": "C-1",
          Status: "qualified",
          Description: "Planning request",
          Todo: "Send KP"
        },
        "workspace-1",
        0
      )
    ).toMatchObject({
      client: {
        id: "C-1",
        workspaceId: "workspace-1",
        name: "Max",
        email: "max@example.com",
        whatsapp: "Telegram"
      },
      lead: {
        id: "L-1",
        clientId: "C-1",
        name: "Swiss lead",
        status: "qualified",
        notes: expect.stringContaining("Send KP")
      }
    });
  });
});

