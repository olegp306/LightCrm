import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("orchestrator rule hygiene", () => {
  it("does not keep active phrase or regex parser tables in rules.ts", () => {
    const source = readFileSync(join(__dirname, "rules.ts"), "utf8");

    expect(source).not.toContain("newLeadPhrases");
    expect(source).not.toContain("negatedNewLeadPatterns");
    expect(source).not.toContain("riskyPhrases");
    expect(source).not.toContain("firstMatch(");
    expect(source).not.toContain("includesAnyPhrase(");
    expect(source).not.toContain("RegExp");
  });
});
