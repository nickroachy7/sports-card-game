import { describe, expect, test } from "vitest";

import { mapBdlStatus } from "@/lib/mlb/schedule-sync";

describe("mapBdlStatus", () => {
  test("null / undefined / empty → 'scheduled'", () => {
    expect(mapBdlStatus(null)).toBe("scheduled");
    expect(mapBdlStatus(undefined)).toBe("scheduled");
    expect(mapBdlStatus("")).toBe("scheduled");
  });

  test("scheduled-family BDL values → 'scheduled'", () => {
    expect(mapBdlStatus("Scheduled")).toBe("scheduled");
    expect(mapBdlStatus("Pre-Game")).toBe("scheduled");
    expect(mapBdlStatus("Warmup")).toBe("scheduled");
  });

  test("in-progress / live → 'live' (case + wording variants)", () => {
    expect(mapBdlStatus("In Progress")).toBe("live");
    expect(mapBdlStatus("Live")).toBe("live");
    expect(mapBdlStatus("In Progress - 3rd Inning")).toBe("live");
    expect(mapBdlStatus("in progress")).toBe("live");
  });

  test("final + wording variants → 'final'", () => {
    expect(mapBdlStatus("Final")).toBe("final");
    expect(mapBdlStatus("Final/10")).toBe("final");
    expect(mapBdlStatus("FINAL")).toBe("final");
    expect(mapBdlStatus("Game Over - Final")).toBe("final");
  });

  test("postponed → 'postponed'", () => {
    expect(mapBdlStatus("Postponed")).toBe("postponed");
    expect(mapBdlStatus("postponed - weather")).toBe("postponed");
  });

  test("delayed + suspended → 'suspended'", () => {
    expect(mapBdlStatus("Delayed")).toBe("suspended");
    expect(mapBdlStatus("Rain Delay")).toBe("suspended");
    expect(mapBdlStatus("Suspended")).toBe("suspended");
    expect(mapBdlStatus("Suspended - Rain")).toBe("suspended");
  });

  test("canceled → 'canceled'", () => {
    expect(mapBdlStatus("Canceled")).toBe("canceled");
    expect(mapBdlStatus("Cancelled")).toBe("canceled");
    expect(mapBdlStatus("cancel")).toBe("canceled");
  });

  test("unknown strings default to 'scheduled' (conservative)", () => {
    expect(mapBdlStatus("TBD")).toBe("scheduled");
    expect(mapBdlStatus("ToBeDetermined")).toBe("scheduled");
    expect(mapBdlStatus("🤷")).toBe("scheduled");
  });

  test("priority: 'final' wins over any substring collision", () => {
    // If BDL ever wrote something weird like "Final Inning - In Progress" it
    // should still be 'final' because 'final' is checked first.
    expect(mapBdlStatus("Final Inning - In Progress")).toBe("final");
  });
});
