import { describe, expect, it } from "vitest";
import { evaluateCommercialOfferReadiness, type FeeTableRow } from "./offers";

const feeRows: FeeTableRow[] = [
  {
    bgfFrom: 140,
    bgfTo: 144,
    wohnflaecheLabel: "~105-108",
    lp1_3Net: 5740,
    lp4Net: 2460,
    totalNet: 8200,
    vat: 1560,
    totalGross: 9760
  }
];

describe("evaluateCommercialOfferReadiness", () => {
  it("calculates an automatic offer when standard lead facts match the active fee table", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        clientName: "Maxim",
        projectName: "Haus Bayern",
        projectAddress: "Bayern",
        projectType: "EFH Neubau",
        bgf: 142
      },
      feeRows
    );

    expect(readiness).toMatchObject({
      status: "doc_ready",
      pricingMode: "auto",
      missingFields: [],
      values: {
        lp1_3Net: 5740,
        lp4Net: 2460,
        totalNet: 8200,
        mwst: 1560,
        totalGross: 9760,
        ms1Net: 2460,
        ms2Net: 3280,
        ms3Net: 2460
      }
    });
  });

  it("keeps pricing ready when identity fields are still missing", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        bgf: 142
      },
      feeRows
    );

    expect(readiness.status).toBe("price_ready");
    expect(readiness.values.totalGross).toBe(9760);
    expect(readiness.missingFields).toEqual(["project_name", "project_address", "client_name"]);
  });

  it("does not price non-standard project types in the current automatic mode", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        clientName: "Bautraeger",
        projectType: "Denkmalschutz Mehrfamilienhaus",
        bgf: 142
      },
      feeRows
    );

    expect(readiness.status).toBe("not_ready");
    expect(readiness.pricingMode).toBe("auto");
  });
});
