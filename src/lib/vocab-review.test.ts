import { describe, it, expect } from "vitest";
import { answerReview, currentWord, revealReview, reviewDone, startReview } from "@/lib/vocab-review";
import type { VocabWord } from "@/lib/vocab";

const w = (id: string, streak = 0): VocabWord => ({
  id, user_id: "u", word: id, word_key: id, meaning_tr: null, ipa: null, audio_url: null, senses: [],
  lookup: "found", streak, learned_at: null, reviewed_at: null, created_at: `2026-11-22T10:0${id.length}:00Z`,
});

describe("review session", () => {
  it("starts on the first word of the round, hidden", () => {
    const s = startReview([w("a"), w("bb", 2)]);
    expect(currentWord(s)?.id).toBe("a");
    expect(s.revealed).toBe(false);
    expect(reviewDone(s)).toBe(false);
  });

  it("reveals, then moves on with each answer and counts known and newly learned words", () => {
    let s = startReview([w("a"), w("bb", 2)]);
    s = revealReview(s);
    expect(s.revealed).toBe(true);
    s = answerReview(s, true);
    expect(s).toMatchObject({ index: 1, revealed: false, known: 1, learned: 0 });
    s = answerReview(revealReview(s), true);
    expect(s).toMatchObject({ index: 2, known: 2, learned: 1 });
    expect(reviewDone(s)).toBe(true);
    expect(currentWord(s)).toBeNull();
  });

  it("counts a don't-know as neither known nor learned", () => {
    const s = answerReview(startReview([w("bb", 2)]), false);
    expect(s).toMatchObject({ known: 0, learned: 0, index: 1 });
  });

  it("ignores answers once the round is over", () => {
    const done = answerReview(startReview([w("a")]), true);
    expect(answerReview(done, true)).toBe(done);
  });

  it("is done at once with nothing to review", () => {
    expect(reviewDone(startReview([]))).toBe(true);
  });
});
