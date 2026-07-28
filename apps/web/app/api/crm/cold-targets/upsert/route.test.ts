import { describe, expect, it } from "vitest";

describe("cold targets upsert route", () => {
  it("accepts direct create and update payloads", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/cold-targets/upsert", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          id: "cold-direct",
          name: "Maya Ops",
          email: "maya@example.com",
          hook: "Reference the new logistics hub before outreach."
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: "cold-direct",
      name: "Maya Ops",
      email: "maya@example.com",
      hook: "Reference the new logistics hub before outreach."
    });
  });

  it("accepts patch payloads from inline table and details edits", async () => {
    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/crm/cold-targets/upsert", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          id: "cold-patch",
          name: "Patch Target",
          email: "old@example.com",
          role: "Founder",
          hook: "Old angle"
        })
      })
    );

    const response = await POST(
      new Request("http://localhost/api/crm/cold-targets/upsert", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          coldTargetId: "cold-patch",
          patch: {
            email: "new@example.com",
            role: "Head of Growth",
            hook: "Lead with a founder-led sales audit."
          },
          source: { channel: "web-table" }
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: "cold-patch",
      name: "Patch Target",
      email: "new@example.com",
      role: "Head of Growth",
      hook: "Lead with a founder-led sales audit."
    });
  });
});
