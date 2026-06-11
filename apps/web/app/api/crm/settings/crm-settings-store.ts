import type { FeeTableRow } from "@lightcrm/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

export type OfferTemplateSettings = {
  fileName: string;
  uploadedAt: string;
  placeholders: string[];
  storagePath: string;
};

export type FeeTableSettings = {
  fileName: string;
  uploadedAt: string;
  year: number;
  rows: FeeTableRow[];
  source: "parsed" | "fallback";
};

export type CrmRuntimeSettings = {
  commercialOffers: {
    activeTemplate: OfferTemplateSettings | null;
    activeFeeTable: FeeTableSettings | null;
    vatRate: number;
    offerValidityDays: number;
    autoGenerateWhenReady: boolean;
  };
};

const fallbackFeeRows: FeeTableRow[] = [
  [100, 104, "~75-78", 4725, 2025, 6750, 1285, 8035],
  [105, 109, "~79-82", 4855, 2080, 6935, 1320, 8255],
  [110, 114, "~83-86", 4990, 2140, 7130, 1355, 8485],
  [115, 119, "~86-89", 5120, 2195, 7315, 1390, 8705],
  [120, 124, "~90-93", 5250, 2250, 7500, 1425, 8925],
  [125, 129, "~94-97", 5375, 2305, 7680, 1460, 9140],
  [130, 134, "~98-101", 5495, 2355, 7850, 1490, 9340],
  [135, 139, "~101-104", 5620, 2410, 8030, 1525, 9555],
  [140, 144, "~105-108", 5740, 2460, 8200, 1560, 9760],
  [145, 149, "~109-112", 5865, 2515, 8380, 1590, 9970],
  [150, 154, "~113-116", 5985, 2565, 8550, 1625, 10175],
  [155, 159, "~116-119", 6100, 2615, 8715, 1655, 10370],
  [160, 164, "~120-123", 6215, 2665, 8880, 1685, 10565],
  [165, 169, "~124-127", 6325, 2710, 9035, 1715, 10750],
  [170, 174, "~128-131", 6440, 2760, 9200, 1750, 10950],
  [175, 179, "~131-134", 6555, 2810, 9365, 1780, 11145],
  [180, 184, "~135-138", 6670, 2860, 9530, 1810, 11340],
  [185, 189, "~139-142", 6780, 2905, 9685, 1840, 11525],
  [190, 194, "~143-146", 6895, 2955, 9850, 1870, 11720],
  [195, 199, "~146-149", 7010, 3005, 10015, 1905, 11920],
  [200, 204, "~150-153", 7125, 3055, 10180, 1935, 12115],
  [205, 209, "~154-157", 7280, 3120, 10400, 1975, 12375],
  [210, 214, "~158-161", 7435, 3185, 10620, 2020, 12640],
  [215, 219, "~161-164", 7590, 3255, 10845, 2060, 12905],
  [220, 224, "~165-168", 7750, 3320, 11070, 2105, 13175],
  [225, 229, "~169-172", 7905, 3390, 11295, 2145, 13440],
  [230, 234, "~173-176", 8060, 3455, 11515, 2190, 13705],
  [235, 239, "~176-179", 8215, 3520, 11735, 2230, 13965],
  [240, 244, "~180-183", 8375, 3590, 11965, 2275, 14240],
  [245, 249, "~184-187", 8530, 3655, 12185, 2315, 14500],
  [250, 254, "~188-191", 8685, 3720, 12405, 2355, 14760]
].map(([bgfFrom, bgfTo, wohnflaecheLabel, lp1_3Net, lp4Net, totalNet, vat, totalGross]) => ({
  bgfFrom: Number(bgfFrom),
  bgfTo: Number(bgfTo),
  wohnflaecheLabel: String(wohnflaecheLabel),
  lp1_3Net: Number(lp1_3Net),
  lp4Net: Number(lp4Net),
  totalNet: Number(totalNet),
  vat: Number(vat),
  totalGross: Number(totalGross)
}));

const defaultCrmSettings: CrmRuntimeSettings = {
  commercialOffers: {
    activeTemplate: null,
    activeFeeTable: {
      fileName: "Honorartabelle 2026 fallback",
      uploadedAt: new Date(0).toISOString(),
      year: 2026,
      rows: fallbackFeeRows,
      source: "fallback"
    },
    vatRate: 0.19,
    offerValidityDays: 90,
    autoGenerateWhenReady: true
  }
};

const globalForSettings = globalThis as unknown as {
  lightCrmRuntimeSettings?: CrmRuntimeSettings;
};

const storageRoot = join(resolve(process.cwd(), "../.."), ".local-storage");
const commercialOffersRoot = join(storageRoot, "commercial-offers");
const activeTemplatePath = join(commercialOffersRoot, "active-template.docx");
const settingsPath = join(storageRoot, "crm-settings.json");

async function writeCrmSettings(settings: CrmRuntimeSettings) {
  await mkdir(storageRoot, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

export async function getCrmRuntimeSettings(): Promise<CrmRuntimeSettings> {
  if (globalForSettings.lightCrmRuntimeSettings) {
    return globalForSettings.lightCrmRuntimeSettings;
  }
  try {
    const raw = await readFile(settingsPath, "utf8");
    const stored = JSON.parse(raw) as CrmRuntimeSettings;
    const settings = {
      ...defaultCrmSettings,
      ...stored,
      commercialOffers: {
        ...defaultCrmSettings.commercialOffers,
        ...(stored.commercialOffers ?? {})
      }
    };
    globalForSettings.lightCrmRuntimeSettings = settings;
    return settings;
  } catch {
    globalForSettings.lightCrmRuntimeSettings = defaultCrmSettings;
    return defaultCrmSettings;
  }
}

export async function updateCrmRuntimeSettings(settings: CrmRuntimeSettings): Promise<CrmRuntimeSettings> {
  globalForSettings.lightCrmRuntimeSettings = settings;
  await writeCrmSettings(settings);
  return settings;
}

function readUInt16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function writeUInt16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = {
  name: string;
  content: Buffer;
};

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (readUInt32(buffer, index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("DOCX zip directory not found");
  }
  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) {
      throw new Error("DOCX zip directory is invalid");
    }
    const method = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const fileNameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const localNameLength = readUInt16(buffer, localHeaderOffset + 26);
    const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    entries.push({
      name,
      content: method === 8 ? inflateRawSync(compressed) : compressed
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZipFile(buffer: Buffer, targetName: string): Buffer {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (readUInt32(buffer, index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("DOCX zip directory not found");
  }
  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocdOffset + 16);
  let offset = centralDirectoryOffset;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) {
      throw new Error("DOCX zip directory is invalid");
    }
    const method = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const fileNameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (name === targetName) {
      const localNameLength = readUInt16(buffer, localHeaderOffset + 26);
      const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      return method === 8 ? inflateRawSync(compressed) : compressed;
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  throw new Error(`${targetName} not found in DOCX`);
}

export function extractDocxPlaceholders(buffer: Buffer): string[] {
  const xml = extractZipFile(buffer, "word/document.xml").toString("utf8");
  const text = xml.replace(/<[^>]+>/g, " ");
  return Array.from(new Set(text.match(/\{\{[^}]+\}\}/g) ?? [])).sort();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.content);
    const crc = crc32(entry.content);
    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(8),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(compressed.length),
      writeUInt32(entry.content.length),
      writeUInt16(fileName.length),
      writeUInt16(0),
      fileName
    ]);
    localParts.push(localHeader, compressed);
    centralParts.push(
      Buffer.concat([
        writeUInt32(0x02014b50),
        writeUInt16(20),
        writeUInt16(20),
        writeUInt16(0),
        writeUInt16(8),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt32(crc),
        writeUInt32(compressed.length),
        writeUInt32(entry.content.length),
        writeUInt16(fileName.length),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt32(0),
        writeUInt32(offset),
        fileName
      ])
    );
    offset += localHeader.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(localFiles.length),
    writeUInt16(0)
  ]);
  return Buffer.concat([localFiles, centralDirectory, eocd]);
}

export function renderDocxTemplate(buffer: Buffer, values: Record<string, string | number | null | undefined>): Buffer {
  const entries = readZipEntries(buffer);
  return buildZip(
    entries.map((entry) => {
      if (entry.name !== "word/document.xml") {
        return entry;
      }
      let xml = entry.content.toString("utf8");
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined || value === "") {
          continue;
        }
        xml = xml.replaceAll(`{{${key}}}`, xmlEscape(String(value)));
      }
      return { ...entry, content: Buffer.from(xml, "utf8") };
    })
  );
}

export async function saveActiveOfferTemplate(buffer: Buffer) {
  await mkdir(commercialOffersRoot, { recursive: true });
  await writeFile(activeTemplatePath, buffer);
  return activeTemplatePath;
}

export async function readActiveOfferTemplate(): Promise<Buffer> {
  return readFile(activeTemplatePath);
}

function money(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

export function parseFeeTableText(text: string): FeeTableRow[] {
  const normalized = text.replace(/\u00a0/g, " ");
  const rows: FeeTableRow[] = [];
  const pattern =
    /(\d{3})[–-](\d{3})\s+~?(\d{2,3})[–-](\d{2,3})\s+([\d.]+)\s*€\s+([\d.]+)\s*€\s+([\d.]+)\s*€\s+([\d.]+)\s*€\s+([\d.]+)\s*€/g;
  for (const match of normalized.matchAll(pattern)) {
    rows.push({
      bgfFrom: Number(match[1]),
      bgfTo: Number(match[2]),
      wohnflaecheLabel: `~${match[3]}-${match[4]}`,
      lp1_3Net: money(match[5] ?? "0"),
      lp4Net: money(match[6] ?? "0"),
      totalNet: money(match[7] ?? "0"),
      vat: money(match[8] ?? "0"),
      totalGross: money(match[9] ?? "0")
    });
  }
  return rows;
}

export function fallbackHonorartabelle2026(): FeeTableRow[] {
  return fallbackFeeRows;
}
