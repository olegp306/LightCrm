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

  it("summarizes PDF attachments from extracted text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  shortSummary: "Prefab company requests LP 3 and 4 planning support.",
                  longSummary: "A German prefab company builds about 50 houses per year and needs a new architecture partner."
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
        kind: "pdf",
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4
      },
      bytes: new Uint8Array([1, 2, 3, 4]),
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      pdfTextExtractor: async () =>
        "Wir sind ein Fertighausunternehmen mit rund 50 realisierten Häusern pro Jahr. Wir suchen einen Partner für LP 3 & 4.",
      fetchImpl
    });

    expect(result).toEqual({
      summary: "Prefab company requests LP 3 and 4 planning support.",
      longSummary: "A German prefab company builds about 50 houses per year and needs a new architecture partner."
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Fertighausunternehmen")
      })
    );
  });

  it("transcribes and summarizes audio attachments", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "Bitte erstellen Sie ein Angebot für ein Haus mit 85 Quadratmetern." }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    shortSummary: "Audio asks for an offer for an 85 m2 house.",
                    longSummary: "The caller requests a commercial offer for a house project with 85 square meters."
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
        fileId: "file-audio",
        uniqueId: "unique-audio",
        kind: "audio",
        fileName: "clipboard.mp4",
        mimeType: "audio/mp4",
        sizeBytes: 4
      },
      bytes: new Uint8Array([1, 2, 3, 4]),
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      audioModel: "whisper-1",
      fetchImpl
    });

    expect(result).toEqual({
      summary: "Audio asks for an offer for an 85 m2 house.",
      longSummary: "The caller requests a commercial offer for a house project with 85 square meters."
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: expect.any(FormData)
      })
    );
    const transcriptionBody = fetchImpl.mock.calls[0]?.[1]?.body as FormData;
    const uploadedFile = transcriptionBody.get("file") as File;
    expect(uploadedFile.name).toBe("clipboard.m4a");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("85 Quadratmetern")
      })
    );
  });
});
