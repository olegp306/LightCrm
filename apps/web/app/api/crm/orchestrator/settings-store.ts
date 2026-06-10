import {
  DEFAULT_LANGGRAPH_SETTINGS,
  LANGGRAPH_PRESETS,
  mergeLangGraphSettings,
  type LangGraphRuntimeSettings,
  type LangGraphRuntimeSettingsInput
} from "@lightcrm/orchestrator";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const globalForSettings = globalThis as unknown as {
  lightCrmLangGraphSettings?: LangGraphRuntimeSettings;
};

const settingsPath = join(resolve(process.cwd(), "../.."), ".local-storage", "langgraph-settings.json");

async function readStoredSettings(): Promise<LangGraphRuntimeSettings | null> {
  try {
    const raw = await readFile(settingsPath, "utf8");
    return mergeLangGraphSettings(JSON.parse(raw) as LangGraphRuntimeSettingsInput);
  } catch {
    return null;
  }
}

async function writeStoredSettings(settings: LangGraphRuntimeSettings) {
  await mkdir(join(resolve(process.cwd(), "../.."), ".local-storage"), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

export async function getLangGraphSettings(): Promise<LangGraphRuntimeSettings> {
  if (globalForSettings.lightCrmLangGraphSettings) {
    return globalForSettings.lightCrmLangGraphSettings;
  }
  const stored = await readStoredSettings();
  const settings = stored ?? mergeLangGraphSettings(DEFAULT_LANGGRAPH_SETTINGS);
  globalForSettings.lightCrmLangGraphSettings = settings;
  return settings;
}

export async function updateLangGraphSettings(
  value: LangGraphRuntimeSettingsInput
): Promise<LangGraphRuntimeSettings> {
  const settings = mergeLangGraphSettings(value);
  globalForSettings.lightCrmLangGraphSettings = settings;
  await writeStoredSettings(settings);
  return settings;
}

export function getLangGraphPresets() {
  return LANGGRAPH_PRESETS.map((preset) => mergeLangGraphSettings(preset));
}
