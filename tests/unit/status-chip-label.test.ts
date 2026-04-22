import { describe, expect, it } from "vitest";

import { liveLabel, ordinal } from "@/lib/lineup/status-chip-label";

describe("ordinal", () => {
  it("handles 1st/2nd/3rd", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
  });

  it("handles 4–10 as th", () => {
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(10)).toBe("10th");
  });

  it("handles 11/12/13 as th (English pluralization edge case)", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });

  it("continues st/nd/rd for 21–23", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
  });

  it("baseball extras never go above 20 in practice but still format", () => {
    expect(ordinal(20)).toBe("20th");
  });
});

describe("liveLabel", () => {
  it("shows fallback while games-count is loading", () => {
    expect(liveLabel(null, 0, /* gamesReady */ false)).toBe("Live · Games in progress");
  });

  it("shows 'Games ending' when no games are currently live", () => {
    expect(liveLabel(null, 0, true)).toBe("Live · Games ending");
  });

  it("shows count without inning when no events have fired yet", () => {
    expect(liveLabel(null, 3, true)).toBe("Live · 3 games active");
  });

  it("singular vs plural count", () => {
    expect(liveLabel(null, 1, true)).toBe("Live · 1 game active");
    expect(liveLabel(null, 2, true)).toBe("Live · 2 games active");
  });

  it("full rendering: Top 5th · 3 games active", () => {
    expect(liveLabel({ inning: 5, half: "top" }, 3, true)).toBe("Live · Top 5th · 3 games active");
  });

  it("Bottom inning rendering", () => {
    expect(liveLabel({ inning: 9, half: "bottom" }, 1, true)).toBe(
      "Live · Bottom 9th · 1 game active",
    );
  });
});
