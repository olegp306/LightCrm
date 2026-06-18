import { describe, expect, it } from "vitest";
import { incomingCommercialOfferSummary } from "./commercial-offer-documents";

describe("incomingCommercialOfferSummary", () => {
  it("formats uploaded commercial offers like generated KP drafts and omits unrelated parsed text", () => {
    const summary = incomingCommercialOfferSummary({
      version: 3,
      fileName: "KP V3 returned.pdf",
      label: "uploaded received offer (PDF)",
      summary:
        "KP V3 Client: Tatjana Borov Projekt: Suche russischen Architekten Grundstück: Deutschland BGF 200 m² Wohnfläche 150 m² LP 1-3 net 5.091 EUR LP 4 net 5.085 EUR Total net 10.176 EUR VAT 19% 1.934 EUR Total gross 12.110 EUR Payment plan net 30% 3.053 EUR 40% 4.070 EUR 30% 3.053 EUR Sehr geehrte Damen und Herren, vielen Dank..."
    });

    expect(summary.shortSummary).toBe("KP V3 received | gross 12.110 EUR | BGF 200 m² | Wohnflaeche 150 m² | received");
    expect(summary.longSummary.split("\n").slice(0, 11)).toEqual([
      "Version: KP V3 received.",
      "Pricing mode: received.",
      "BGF: 200 m².",
      "Wohnflaeche: 150 m².",
      "LP 1-3 net: 5.091 EUR.",
      "LP 4 net: 5.085 EUR.",
      "Total net: 10.176 EUR.",
      "VAT 19%: 1.934 EUR.",
      "Total gross: 12.110 EUR.",
      "Payment plan net: 30% 3.053 EUR, 40% 4.070 EUR, 30% 3.053 EUR.",
      "Summary: KP V3 received/uploaded commercial offer. Use this summary to compare what was received from the client against generated draft versions."
    ]);
    expect(summary.longSummary).not.toContain("Parsed notes");
    expect(summary.longSummary).not.toContain("Sehr geehrte");
  });
});
