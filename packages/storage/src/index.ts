import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StorageEnv = {
  STORAGE_PROVIDER?: string;
  LOCAL_STORAGE_DIR?: string;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
};

export type StoreCrmFileInput = {
  bytes: Uint8Array;
  fileName: string;
  workspaceId: string;
  leadId?: string | null;
  clientId?: string | null;
  mimeType?: string | null;
  env?: StorageEnv;
};

export type StoredCrmFile = {
  fileName: string;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  downloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number;
};

const translit: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ы: "y",
  э: "e",
  ю: "yu",
  я: "ya"
};

export function sanitizeStorageSegment(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[ъь]/g, "")
    .replace(/[а-яё]/g, (char) => translit[char] ?? char)
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return ascii || "file";
}

function buildStorageKey(input: StoreCrmFileInput): string {
  const scope = input.leadId
    ? `leads/${sanitizeStorageSegment(input.leadId)}`
    : input.clientId
      ? `clients/${sanitizeStorageSegment(input.clientId)}`
      : "unlinked";
  return `workspaces/${sanitizeStorageSegment(input.workspaceId)}/${scope}/${sanitizeStorageSegment(input.fileName)}`;
}

function hasS3Config(env: StorageEnv): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

async function storeS3(input: StoreCrmFileInput, env: StorageEnv, storageKey: string): Promise<StoredCrmFile> {
  const bucket = env.S3_BUCKET as string;
  const client = new S3Client({
    region: env.S3_REGION ?? "auto",
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string
    }
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: Buffer.from(input.bytes),
      ContentType: input.mimeType ?? undefined
    })
  );
  return {
    fileName: input.fileName,
    storageProvider: "s3",
    storageBucket: bucket,
    storageKey,
    downloadUrl: env.S3_ENDPOINT ? `${env.S3_ENDPOINT.replace(/\/$/, "")}/${bucket}/${storageKey}` : null,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.bytes.byteLength
  };
}

async function storeLocal(input: StoreCrmFileInput, env: StorageEnv, storageKey: string): Promise<StoredCrmFile> {
  const root = env.LOCAL_STORAGE_DIR ?? ".local-storage";
  const absolutePath = join(root, storageKey);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);
  return {
    fileName: input.fileName,
    storageProvider: "local",
    storageBucket: null,
    storageKey,
    downloadUrl: `/api/crm/storage/local/${encodeURIComponent(storageKey)}`,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.bytes.byteLength
  };
}

export async function storeCrmFile(input: StoreCrmFileInput): Promise<StoredCrmFile> {
  const env: StorageEnv = input.env ?? (process.env as StorageEnv);
  const storageKey = buildStorageKey(input);
  if ((env.STORAGE_PROVIDER ?? "local") === "s3" && hasS3Config(env)) {
    return storeS3(input, env, storageKey);
  }
  return storeLocal(input, env, storageKey);
}
