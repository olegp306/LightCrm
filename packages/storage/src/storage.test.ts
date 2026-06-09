import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { isPathInsideRoot, sanitizeStorageSegment, storeCrmFile } from "./index";

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("crm storage", () => {
  it("sanitizes storage key segments", () => {
    expect(sanitizeStorageSegment("../дом brief.pdf")).toBe("dom-brief.pdf");
  });

  it("stores files locally when s3 settings are absent", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lightcrm-storage-"));

    const stored = await storeCrmFile({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "brief.pdf",
      workspaceId: "workspace-1",
      leadId: "lead-1",
      mimeType: "application/pdf",
      env: {
        STORAGE_PROVIDER: "local",
        LOCAL_STORAGE_DIR: tempDir
      }
    });

    expect(stored).toMatchObject({
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/workspace-1/leads/lead-1/brief.pdf",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3
    });
    expect(stored.downloadUrl).toContain("/api/crm/storage/local/");
    await expect(readFile(join(tempDir, stored.storageKey))).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("keeps the display file name while adding an optional unique storage suffix", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lightcrm-storage-"));

    const stored = await storeCrmFile({
      bytes: new Uint8Array([4, 5, 6]),
      fileName: "photo.png",
      workspaceId: "workspace-1",
      leadId: "lead-1",
      mimeType: "image/png",
      storageKeySuffix: "batch-1",
      env: {
        STORAGE_PROVIDER: "local",
        LOCAL_STORAGE_DIR: tempDir
      }
    });

    expect(stored.fileName).toBe("photo.png");
    expect(stored.storageKey).toBe("workspaces/workspace-1/leads/lead-1/batch-1-photo.png");
    await expect(readFile(join(tempDir, stored.storageKey))).resolves.toEqual(Buffer.from([4, 5, 6]));
  });

  it("rejects sibling paths that only share the storage root prefix", () => {
    expect(isPathInsideRoot("C:\\data\\.local-storage", "C:\\data\\.local-storage\\file.txt")).toBe(true);
    expect(isPathInsideRoot("C:\\data\\.local-storage", "C:\\data\\.local-storage-evil\\secret.txt")).toBe(false);
    expect(isPathInsideRoot("/data/.local-storage", "/data/.local-storage/file.txt")).toBe(true);
    expect(isPathInsideRoot("/data/.local-storage", "/data/.local-storage-evil/secret.txt")).toBe(false);
  });
});
