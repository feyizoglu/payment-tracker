// Words for the Describe It game. Each language has its own list per category; the
// categories are shared.

export const WORD_CATEGORIES = [
  "animals",
  "food",
  "jobs",
  "places",
  "objects",
  "sports",
  "home",
  "nature",
  "body",
  "transport",
  "arts",
  "actions",
  "idioms",
] as const;
export type WordCategory = (typeof WORD_CATEGORIES)[number];

export type WordLevel = "easy" | "hard";

export interface WordCard {
  /** `<category>-<n>`: a card's position in its file. Seen lists store it. */
  id: string;
  word: string;
  forbidden: readonly [string, string, string, string];
  level: WordLevel;
}

type Row = readonly [word: string, level: WordLevel, forbidden: readonly [string, string, string, string]];

// Ids come from the row's position, so rows are only ever appended: inserting, reordering
// or deleting a row would give another word an id a device has already seen.
export function cards(category: WordCategory, rows: readonly Row[]): WordCard[] {
  return rows.map(([word, level, forbidden], i) => ({ id: `${category}-${i + 1}`, word, level, forbidden }));
}
