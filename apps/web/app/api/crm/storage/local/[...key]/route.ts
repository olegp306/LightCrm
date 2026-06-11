import { isPathInsideRoot } from "@lightcrm/storage";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";

function storageKeyFromParams(params: { key?: string | string[] } | undefined): string {
  const key = params?.key;
  if (Array.isArray(key)) {
    return key.map((part) => decodeURIComponent(part)).join("/");
  }
  return decodeURIComponent(key ?? "");
}

export async function GET(_request: Request, context: { params?: { key?: string | string[] } }) {
  const key = storageKeyFromParams(context.params);
  const root = resolve(process.env.LOCAL_STORAGE_DIR ?? ".local-storage");
  const filePath = resolve(join(root, key));
  if (!key || !isPathInsideRoot(root, filePath)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }
  try {
    const bytes = await readFile(filePath);
    return new Response(bytes);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
