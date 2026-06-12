import { describe, expect, it, vi } from "vitest";
import { analyzeTelegramAttachment } from "./attachment-analysis";

describe("telegram attachment analysis", () => {
  it("extracts image summaries from an OpenAI JSON response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  shortSummary: "Obernsees development property, 92,500 m2, EUR 9,275,000.",
                  longSummary: "The image describes a tourist development property near Bayreuth."
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await analyzeTelegramAttachment({
      attachment: {
        fileId: "file-1",
        uniqueId: "unique-1",
        kind: "image",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 4
      },
      bytes: new Uint8Array([1, 2, 3, 4]),
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      fetchImpl
    });

    expect(result).toEqual({
      summary: "Obernsees development property, 92,500 m2, EUR 9,275,000.",
      longSummary: "The image describes a tourist development property near Bayreuth."
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: expect.stringContaining("data:image/jpeg;base64,AQIDBA==")
      })
    );
  });

  it("skips non-image attachments", async () => {
    const fetchImpl = vi.fn();
    const result = await analyzeTelegramAttachment({
      attachment: {
        fileId: "file-1",
        uniqueId: "unique-1",
        kind: "pdf",
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4
      },
      bytes: new Uint8Array([1, 2, 3, 4]),
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      fetchImpl
    });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
