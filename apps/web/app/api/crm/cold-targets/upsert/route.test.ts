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
          email: "maya@example.com"
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: "cold-direct",
      name: "Maya Ops",
      email: "maya@example.com"
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
          role: "Founder"
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
            role: "Head of Growth"
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
      role: "Head of Growth"
    });
  });
});
