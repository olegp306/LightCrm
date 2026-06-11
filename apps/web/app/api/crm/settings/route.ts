import { NextResponse } from "next/server";
import { handleRouteError } from "../_shared";
import { getCrmRuntimeSettings, updateCrmRuntimeSettings } from "./crm-settings-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ settings: await getCrmRuntimeSettings() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const current = await getCrmRuntimeSettings();
    const input = (await request.json()) as {
      commercialOffers?: Partial<{
        vatRate: number;
        offerValidityDays: number;
        autoGenerateWhenReady: boolean;
      }>;
    };
    const next = {
      ...current,
      commercialOffers: {
        ...current.commercialOffers,
        ...(input.commercialOffers?.vatRate === undefined ? {} : { vatRate: input.commercialOffers.vatRate }),
        ...(input.commercialOffers?.offerValidityDays === undefined
          ? {}
          : { offerValidityDays: input.commercialOffers.offerValidityDays }),
        ...(input.commercialOffers?.autoGenerateWhenReady === undefined
          ? {}
          : { autoGenerateWhenReady: input.commercialOffers.autoGenerateWhenReady })
      }
    };
    return NextResponse.json({ settings: await updateCrmRuntimeSettings(next) });
  } catch (error) {
    return handleRouteError(error);
  }
}
