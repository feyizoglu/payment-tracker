import { VOCAB_LEARNED_STREAK, reviewRound, type VocabWord } from "./vocab";

export interface ReviewState {
  words: VocabWord[];
  index: number;
  revealed: boolean;
  known: number;
  learned: number;
}

export function startReview(all: readonly VocabWord[]): ReviewState {
  return { words: reviewRound(all), index: 0, revealed: false, known: 0, learned: 0 };
}

export const reviewDone = (s: ReviewState): boolean => s.index >= s.words.length;

export const currentWord = (s: ReviewState): VocabWord | null => s.words[s.index] ?? null;

export const revealReview = (s: ReviewState): ReviewState => (reviewDone(s) ? s : { ...s, revealed: true });

export function answerReview(s: ReviewState, know: boolean): ReviewState {
  const word = currentWord(s);
  if (!word) return s;
  return {
    ...s,
    index: s.index + 1,
    revealed: false,
    known: s.known + (know ? 1 : 0),
    learned: s.learned + (know && word.streak + 1 >= VOCAB_LEARNED_STREAK ? 1 : 0),
  };
}
