import { describe, it, expect } from "vitest";
import { bestAfter, newSessionBest, parseSavedBest, sessionRead } from "@/lib/best-score";

describe("bestAfter", () => {
  const read = (stored: number | null) => sessionRead(newSessionBest(), stored);

  it("claims and saves a score above every best known", () => {
    expect(bestAfter(9, read(5), 5)).toEqual({ session: { best: 9, known: true }, isNew: true, save: 9 });
    expect(bestAfter(9, read(5), 12)).toEqual({ session: { best: 12, known: true }, isNew: false, save: null });
    expect(bestAfter(5, read(5), 5)).toEqual({ session: { best: 5, known: true }, isNew: false, save: null });
    expect(bestAfter(3, read(0), 0)).toEqual({ session: { best: 3, known: true }, isNew: true, save: 3 });
  });

  it("claims and saves nothing while no read has succeeded, but remembers the score", () => {
    expect(bestAfter(10, read(null), null)).toEqual({ session: { best: 10, known: false }, isNew: false, save: null });
  });

  it("saves the session's best once a read succeeds, without claiming a lower score", () => {
    const after = bestAfter(10, newSessionBest(), null).session;
    expect(bestAfter(6, after, 4)).toEqual({ session: { best: 10, known: true }, isNew: false, save: 10 });
  });

  it("keeps claiming against an earlier read when the read at the end fails", () => {
    expect(bestAfter(25, read(20), null)).toEqual({ session: { best: 25, known: true }, isNew: true, save: 25 });
    expect(bestAfter(15, read(20), null)).toEqual({ session: { best: 20, known: true }, isNew: false, save: null });
  });

  it("does not claim again a best this session already played", () => {
    const first = bestAfter(10, read(0), 0);
    expect(first.save).toBe(10);
    expect(bestAfter(5, first.session, 0)).toEqual({ session: { best: 10, known: true }, isNew: false, save: 10 });
  });
});

describe("parseSavedBest", () => {
  it("accepts a non-negative whole number and nothing else", () => {
    expect(parseSavedBest("23")).toBe(23);
    expect(parseSavedBest(null)).toBe(0);
    expect(parseSavedBest("-4")).toBe(0);
    expect(parseSavedBest("2.5")).toBe(0);
    expect(parseSavedBest("abc")).toBe(0);
    expect(parseSavedBest("")).toBe(0);
  });
});
