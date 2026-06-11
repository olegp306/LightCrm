import { NextResponse } from "next/server";
import { handleRouteError, parseJson } from "../../_shared";
import { RuntimeSettingsInput } from "../settings-schema";
import { getLangGraphPresets, getLangGraphSettings, updateLangGraphSettings } from "../settings-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      settings: await getLangGraphSettings(),
      presets: getLangGraphPresets()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = await parseJson(request, RuntimeSettingsInput);
    return NextResponse.json({
      settings: await updateLangGraphSettings(input),
      presets: getLangGraphPresets()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
