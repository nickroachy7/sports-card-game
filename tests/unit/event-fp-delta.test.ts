import { describe, expect, test } from "vitest";

import { eventActionLabel, eventFpDelta } from "@/lib/mlb/event-fp-delta";

describe("eventFpDelta — batter role", () => {
  test("HR event → +12", () => {
    expect(eventFpDelta("mlb.batter.home_run", null, "batter")).toBe(12);
  });

  test("hit/single → +3", () => {
    expect(eventFpDelta("mlb.batter.hit", "Single", "batter")).toBe(3);
    expect(eventFpDelta("mlb.batter.hit", "Bunt Single", "batter")).toBe(3);
    expect(eventFpDelta("mlb.batter.hit", "Infield Single", "batter")).toBe(3);
  });

  test("hit/double → +5, triple → +8, HR (via hit) → +12", () => {
    expect(eventFpDelta("mlb.batter.hit", "Double", "batter")).toBe(5);
    expect(eventFpDelta("mlb.batter.hit", "Triple", "batter")).toBe(8);
    expect(eventFpDelta("mlb.batter.hit", "Home Run", "batter")).toBe(12);
  });

  test("hit with unknown play type → default single", () => {
    expect(eventFpDelta("mlb.batter.hit", "Mystery Play", "batter")).toBe(3);
    expect(eventFpDelta("mlb.batter.hit", null, "batter")).toBe(3);
    expect(eventFpDelta("mlb.batter.hit", undefined, "batter")).toBe(3);
  });

  test("walk / HBP → +2", () => {
    expect(eventFpDelta("mlb.batter.walk", null, "batter")).toBe(2);
    expect(eventFpDelta("mlb.batter.hit_by_pitch", null, "batter")).toBe(2);
  });

  test("strikeout / unknown → 0", () => {
    expect(eventFpDelta("mlb.batter.strikeout", null, "batter")).toBe(0);
    expect(eventFpDelta("mlb.batter.groundout", null, "batter")).toBe(0);
    expect(eventFpDelta("mlb.game.inning_half_ended", null, "batter")).toBe(0);
  });

  test("case-insensitive play type match", () => {
    expect(eventFpDelta("mlb.batter.hit", "DOUBLE", "batter")).toBe(5);
    expect(eventFpDelta("mlb.batter.hit", "bunt single", "batter")).toBe(3);
  });
});

describe("eventFpDelta — pitcher role", () => {
  test("strikeout → +2", () => {
    expect(eventFpDelta("mlb.batter.strikeout", null, "pitcher")).toBe(2);
  });

  test("walk / HBP → -0.6", () => {
    expect(eventFpDelta("mlb.batter.walk", null, "pitcher")).toBe(-0.6);
    expect(eventFpDelta("mlb.batter.hit_by_pitch", null, "pitcher")).toBe(-0.6);
  });

  test("HR allowed → -2.67 (hit + ER)", () => {
    expect(eventFpDelta("mlb.batter.home_run", null, "pitcher")).toBe(-2.67);
  });

  test("hit allowed → -0.67", () => {
    expect(eventFpDelta("mlb.batter.hit", "Single", "pitcher")).toBe(-0.67);
  });

  test("non-pitching events → 0", () => {
    expect(eventFpDelta("mlb.game.inning_ended", null, "pitcher")).toBe(0);
  });
});

describe("eventActionLabel", () => {
  test("maps event types to short narrative", () => {
    expect(eventActionLabel("mlb.batter.home_run", null)).toBe("hit a home run");
    expect(eventActionLabel("mlb.batter.hit", "Double")).toBe("doubled");
    expect(eventActionLabel("mlb.batter.hit", "Triple")).toBe("tripled");
    expect(eventActionLabel("mlb.batter.hit", "Single")).toBe("singled");
    expect(eventActionLabel("mlb.batter.hit", "Bunt Single")).toBe("bunt single");
    expect(eventActionLabel("mlb.batter.walk", null)).toBe("walked");
    expect(eventActionLabel("mlb.batter.strikeout", null)).toBe("struck out");
    expect(eventActionLabel("mlb.batter.hit_by_pitch", null)).toBe("hit by pitch");
  });

  test("unknown event with play type falls back to lowercase play type", () => {
    expect(eventActionLabel("mlb.batter.groundout", "Ground Out")).toBe("ground out");
  });

  test("unknown event without play type → generic", () => {
    expect(eventActionLabel("mlb.batter.unknown", null)).toBe("played");
  });
});
