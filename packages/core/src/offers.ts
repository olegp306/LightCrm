export type FeeTableRow = {
  bgfFrom: number;
  bgfTo: number;
  wohnflaecheLabel: string;
  lp1_3Net: number;
  lp4Net: number;
  totalNet: number;
  vat: number;
  totalGross: number;
};

export type OfferLeadFacts = {
  clientName?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  projectType?: string | null;
  bgf?: number | null;
};

export type OfferReadiness = {
  status: "not_ready" | "price_ready" | "doc_ready" | "manual_required";
  pricingMode: "auto" | "manual";
  missingFields: string[];
  reasons: string[];
  values: {
    bgf: number | null;
    wohnflaeche: number | null;
    wohnflaecheLabel: string | null;
    lp1_3Net: number | null;
    lp4Net: number | null;
    totalNet: number | null;
    mwst: number | null;
    totalGross: number | null;
    ms1Net: number | null;
    ms2Net: number | null;
    ms3Net: number | null;
  };
};

const emptyValues: OfferReadiness["values"] = {
  bgf: null,
  wohnflaeche: null,
  wohnflaecheLabel: null,
  lp1_3Net: null,
  lp4Net: null,
  totalNet: null,
  mwst: null,
  totalGross: null,
  ms1Net: null,
  ms2Net: null,
  ms3Net: null
};

function hasValue(value: string | number | null | undefined): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isStandardProjectType(value: string | null | undefined): boolean {
  const normalized = (value ?? "").toLocaleLowerCase();
  return ["efh", "einfamilienhaus", "private house", "neubau"].some((token) => normalized.includes(token));
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

export function evaluateCommercialOfferReadiness(facts: OfferLeadFacts, feeRows: FeeTableRow[]): OfferReadiness {
  const missingFields: string[] = [];
  const reasons: string[] = [];

  if (!hasValue(facts.bgf)) {
    missingFields.push("bgf");
  }
  if (!hasValue(facts.projectName)) {
    missingFields.push("project_name");
  }
  if (!hasValue(facts.projectAddress)) {
    missingFields.push("project_address");
  }
  if (!hasValue(facts.clientName)) {
    missingFields.push("client_name");
  }

  if (!facts.bgf) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields,
      reasons: ["BGF is required before the fee table can be matched."],
      values: emptyValues
    };
  }

  if (facts.projectType && !isStandardProjectType(facts.projectType)) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields,
      reasons: ["Project type is outside the current automatic commercial offer rule."],
      values: { ...emptyValues, bgf: facts.bgf, wohnflaeche: roundCurrency(facts.bgf * 0.75) }
    };
  }

  const matchedRow = feeRows.find((row) => facts.bgf && facts.bgf >= row.bgfFrom && facts.bgf <= row.bgfTo);
  if (!matchedRow) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields,
      reasons: ["BGF is outside the active automatic fee table range."],
      values: { ...emptyValues, bgf: facts.bgf, wohnflaeche: roundCurrency(facts.bgf * 0.75) }
    };
  }

  const docMissing = missingFields.filter((field) => field !== "bgf");
  if (docMissing.length > 0) {
    reasons.push("Price can be calculated, but the offer document still has missing identity/project fields.");
  }

  return {
    status: docMissing.length > 0 ? "price_ready" : "doc_ready",
    pricingMode: "auto",
    missingFields: docMissing,
    reasons,
    values: {
      bgf: facts.bgf,
      wohnflaeche: roundCurrency(facts.bgf * 0.75),
      wohnflaecheLabel: matchedRow.wohnflaecheLabel,
      lp1_3Net: matchedRow.lp1_3Net,
      lp4Net: matchedRow.lp4Net,
      totalNet: matchedRow.totalNet,
      mwst: matchedRow.vat,
      totalGross: matchedRow.totalGross,
      ms1Net: roundCurrency(matchedRow.totalNet * 0.3),
      ms2Net: roundCurrency(matchedRow.totalNet * 0.4),
      ms3Net: roundCurrency(matchedRow.totalNet * 0.3)
    }
  };
}
