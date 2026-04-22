import { describe, expect, test } from "vitest";

import { type PitcherCandidate, pickWinningPitcher } from "@/lib/mlb/winning-pitcher";

describe("pickWinningPitcher", () => {
  test("qualifying starter (≥5 IP) on the winning team gets the W", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 6.1, isStarter: true, onWinningTeam: true },
      { bdlPlayerId: 2, ip: 1.2, isStarter: false, onWinningTeam: true },
      { bdlPlayerId: 3, ip: 5.0, isStarter: true, onWinningTeam: false }, // losing team
    ];
    expect(pickWinningPitcher(candidates)).toBe(1);
  });

  test("picks the starter with the most IP when multiple qualify", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 5.1, isStarter: true, onWinningTeam: true },
      { bdlPlayerId: 2, ip: 6.2, isStarter: true, onWinningTeam: true },
    ];
    expect(pickWinningPitcher(candidates)).toBe(2);
  });

  test("starter under 5 IP falls back to most-IP-on-winning-team", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 4.2, isStarter: true, onWinningTeam: true },
      { bdlPlayerId: 2, ip: 3.1, isStarter: false, onWinningTeam: true }, // bulk reliever
      { bdlPlayerId: 3, ip: 0.2, isStarter: false, onWinningTeam: true },
    ];
    // Fallback picks the pitcher with the most IP — the short starter.
    expect(pickWinningPitcher(candidates)).toBe(1);
  });

  test("no starter, long reliever gets the W via fallback", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 1.0, isStarter: true, onWinningTeam: true }, // opener pulled early
      { bdlPlayerId: 2, ip: 4.1, isStarter: false, onWinningTeam: true }, // bulk reliever
      { bdlPlayerId: 3, ip: 3.0, isStarter: false, onWinningTeam: true },
    ];
    expect(pickWinningPitcher(candidates)).toBe(2);
  });

  test("no candidate meets the 3 IP floor → null", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 2.1, isStarter: false, onWinningTeam: true },
      { bdlPlayerId: 2, ip: 1.0, isStarter: false, onWinningTeam: true },
    ];
    expect(pickWinningPitcher(candidates)).toBeNull();
  });

  test("no pitchers on the winning team → null", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 9.0, isStarter: true, onWinningTeam: false },
    ];
    expect(pickWinningPitcher(candidates)).toBeNull();
  });

  test("empty pool → null", () => {
    expect(pickWinningPitcher([])).toBeNull();
  });

  test("starter on losing team does not get the W (sanity)", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 8.0, isStarter: true, onWinningTeam: false }, // loser
      { bdlPlayerId: 2, ip: 3.0, isStarter: false, onWinningTeam: true },
    ];
    expect(pickWinningPitcher(candidates)).toBe(2);
  });

  test("multiple relievers on winning team: most IP wins", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 3.2, isStarter: false, onWinningTeam: true },
      { bdlPlayerId: 2, ip: 4.0, isStarter: false, onWinningTeam: true }, // most IP
      { bdlPlayerId: 3, ip: 1.0, isStarter: false, onWinningTeam: true },
    ];
    expect(pickWinningPitcher(candidates)).toBe(2);
  });

  test("exactly 5.0 IP starter qualifies (boundary)", () => {
    const candidates: PitcherCandidate[] = [
      { bdlPlayerId: 1, ip: 5.0, isStarter: true, onWinningTeam: true },
      { bdlPlayerId: 2, ip: 3.0, isStarter: false, onWinningTeam: true },
    ];
    expect(pickWinningPitcher(candidates)).toBe(1);
  });
});
