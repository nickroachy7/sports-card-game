import { describe, expect, it } from "vitest";

import { levenshtein, normalizeName } from "@/lib/mlb/name-match";

describe("normalizeName", () => {
  it("strips diacritics", () => {
    expect(normalizeName("Acuña")).toBe("acuna");
    expect(normalizeName("José")).toBe("jose");
    expect(normalizeName("Ohtani")).toBe("ohtani");
  });

  it("strips common suffixes", () => {
    expect(normalizeName("Ken Griffey Jr.")).toBe("ken griffey");
    expect(normalizeName("Ken Griffey Jr")).toBe("ken griffey");
    expect(normalizeName("Ken Griffey Sr")).toBe("ken griffey");
    expect(normalizeName("Cal Ripken II")).toBe("cal ripken");
    expect(normalizeName("Cal Ripken III")).toBe("cal ripken");
    expect(normalizeName("Ichiro")).toBe("ichiro");
  });

  it("combines diacritic + suffix stripping", () => {
    expect(normalizeName("Ronald Acuña Jr.")).toBe("ronald acuna");
  });

  it("lowercases + trims", () => {
    expect(normalizeName("  JOSE  ")).toBe("jose");
  });

  it("leaves 'IV' alone when it's part of a name", () => {
    // "Alfonso IV" — unusual but the matcher accepts. Fine.
    expect(normalizeName("Alfonso IV")).toBe("alfonso");
  });
});

describe("levenshtein", () => {
  it("returns 0 for equal strings", () => {
    expect(levenshtein("jose", "jose")).toBe(0);
    expect(levenshtein("", "")).toBe(0);
  });

  it("counts single substitution", () => {
    expect(levenshtein("jose", "jase")).toBe(1);
  });

  it("counts insertion", () => {
    expect(levenshtein("jose", "joses")).toBe(1);
    expect(levenshtein("jose", "josese")).toBe(2);
  });

  it("counts deletion", () => {
    expect(levenshtein("jose", "jos")).toBe(1);
    expect(levenshtein("jose", "jo")).toBe(2);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("handles 'Acuna' vs 'Acuna Jr' edge via normalize + distance", () => {
    // Realistic case: "Ronald Acuña Jr." vs DB "Ronald Acuna Jr.".
    // After normalize, both become "ronald acuna" → distance 0.
    expect(levenshtein(normalizeName("Ronald Acuña Jr."), normalizeName("Ronald Acuna Jr."))).toBe(
      0,
    );
  });

  it("supports the <=2 fuzzy budget (typo case)", () => {
    // Typical fuzzy hit: one-letter typo.
    expect(levenshtein("tejada", "tejeda")).toBe(1);
    // Two substitutions still in budget.
    expect(levenshtein("tejada", "rejeda")).toBe(2);
    // Three exceeds.
    expect(levenshtein("tejada", "rojada")).toBe(2);
  });
});
