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
      priceMissingFields: [],
      documentMissingFields: [],
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

  it("keeps pricing ready when identity fields are still missing but project type and BGF are known", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        projectType: "EFH Neubau",
        bgf: 142
      },
      feeRows
    );

    expect(readiness.status).toBe("price_ready");
    expect(readiness.values.totalGross).toBe(9760);
    expect(readiness.missingFields).toEqual(["project_name", "project_address", "client_name"]);
    expect(readiness.priceMissingFields).toEqual([]);
    expect(readiness.documentMissingFields).toEqual(["project_name", "project_address", "client_name"]);
  });

  it("uses a manual gross price when the architect provides the offer number", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        clientName: "Maxim",
        projectName: "Haus Bayern",
        projectAddress: "Bayern",
        projectType: "Denkmalschutz Mehrfamilienhaus",
        bgf: 142,
        manualTotalGross: 12500
      },
      []
    );

    expect(readiness).toMatchObject({
      status: "doc_ready",
      pricingMode: "manual",
      missingFields: [],
      priceMissingFields: [],
      documentMissingFields: [],
      values: {
        totalGross: 12500,
        totalNet: 10504
      }
    });
  });

  it("keeps manual pricing ready while secondary document fields are still missing", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        manualTotalGross: 12500
      },
      []
    );

    expect(readiness.status).toBe("price_ready");
    expect(readiness.pricingMode).toBe("manual");
    expect(readiness.values.totalGross).toBe(12500);
    expect(readiness.priceMissingFields).toEqual([]);
    expect(readiness.documentMissingFields).toEqual(["project_name", "project_address", "client_name"]);
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
    expect(readiness.priceMissingFields).toEqual(["manual_total_gross"]);
    expect(readiness.missingFields).toContain("manual_total_gross");
  });

  it("asks for either BGF/project type or manual gross price before numbers are ready", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        clientName: "Maxim",
        projectName: "Haus Bayern",
        projectAddress: "Bayern"
      },
      feeRows
    );

    expect(readiness.status).toBe("not_ready");
    expect(readiness.priceMissingFields).toEqual(["bgf_or_manual_total_gross", "project_type_or_manual_total_gross"]);
    expect(readiness.documentMissingFields).toEqual([]);
  });

  it("does not calculate an automatic price from BGF alone without project type", () => {
    const readiness = evaluateCommercialOfferReadiness(
      {
        clientName: "Maxim",
        projectName: "Haus Bayern",
        projectAddress: "Bayern",
        bgf: 142
      },
      feeRows
    );

    expect(readiness.status).toBe("not_ready");
    expect(readiness.priceMissingFields).toEqual(["project_type_or_manual_total_gross"]);
    expect(readiness.values.totalGross).toBeNull();
  });
});
