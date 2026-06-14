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
  manualTotalGross?: number | null;
};

export type OfferReadiness = {
  status: "not_ready" | "price_ready" | "doc_ready" | "manual_required";
  pricingMode: "auto" | "manual";
  missingFields: string[];
  priceMissingFields: string[];
  documentMissingFields: string[];
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
  const documentMissingFields: string[] = [];
  const reasons: string[] = [];

  if (!hasValue(facts.projectName)) {
    documentMissingFields.push("project_name");
  }
  if (!hasValue(facts.projectAddress)) {
    documentMissingFields.push("project_address");
  }
  if (!hasValue(facts.clientName)) {
    documentMissingFields.push("client_name");
  }

  if (hasValue(facts.manualTotalGross)) {
    const gross = roundCurrency(Number(facts.manualTotalGross));
    if (documentMissingFields.length > 0) {
      reasons.push("Manual offer price is available, but the offer document still has missing identity/project fields.");
    }
    return {
      status: documentMissingFields.length > 0 ? "price_ready" : "doc_ready",
      pricingMode: "manual",
      missingFields: documentMissingFields,
      priceMissingFields: [],
      documentMissingFields,
      reasons,
      values: {
        ...emptyValues,
        bgf: facts.bgf ?? null,
        wohnflaeche: facts.bgf ? roundCurrency(facts.bgf * 0.75) : null,
        totalGross: gross,
        mwst: roundCurrency(gross - gross / 1.19),
        totalNet: roundCurrency(gross / 1.19)
      }
    };
  }

  const priceMissingFields: string[] = [];
  if (!hasValue(facts.bgf)) {
    priceMissingFields.push("bgf_or_manual_total_gross");
  }
  if (!hasValue(facts.projectType)) {
    priceMissingFields.push("project_type_or_manual_total_gross");
  }

  if (!facts.bgf) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields: [...priceMissingFields, ...documentMissingFields],
      priceMissingFields,
      documentMissingFields,
      reasons: ["BGF or a manual gross price is required before offer numbers are ready."],
      values: emptyValues
    };
  }

  if (!hasValue(facts.projectType)) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields: ["project_type_or_manual_total_gross", ...documentMissingFields],
      priceMissingFields: ["project_type_or_manual_total_gross"],
      documentMissingFields,
      reasons: ["Project type or a manual gross price is required before offer numbers are ready."],
      values: { ...emptyValues, bgf: facts.bgf, wohnflaeche: roundCurrency(facts.bgf * 0.75) }
    };
  }

  if (facts.projectType && !isStandardProjectType(facts.projectType)) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields: ["manual_total_gross", ...documentMissingFields],
      priceMissingFields: ["manual_total_gross"],
      documentMissingFields,
      reasons: ["Project type is outside the current automatic commercial offer rule; add a manual gross price."],
      values: { ...emptyValues, bgf: facts.bgf, wohnflaeche: roundCurrency(facts.bgf * 0.75) }
    };
  }

  const matchedRow = feeRows.find((row) => facts.bgf && facts.bgf >= row.bgfFrom && facts.bgf <= row.bgfTo);
  if (!matchedRow) {
    return {
      status: "not_ready",
      pricingMode: "auto",
      missingFields: ["manual_total_gross", ...documentMissingFields],
      priceMissingFields: ["manual_total_gross"],
      documentMissingFields,
      reasons: ["BGF is outside the active automatic fee table range; add a manual gross price."],
      values: { ...emptyValues, bgf: facts.bgf, wohnflaeche: roundCurrency(facts.bgf * 0.75) }
    };
  }

  if (documentMissingFields.length > 0) {
    reasons.push("Price can be calculated, but the offer document still has missing identity/project fields.");
  }

  return {
    status: documentMissingFields.length > 0 ? "price_ready" : "doc_ready",
    pricingMode: "auto",
    missingFields: documentMissingFields,
    priceMissingFields: [],
    documentMissingFields,
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
