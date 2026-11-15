// Opposite pairs for the Scale game. Each language has its own list, written for that language
// rather than translated.

import type { Lang } from "../i18n";

export interface ScalePair {
  /** `<lang>-<n>`: a pair's position in its file. */
  id: string;
  left: string;
  right: string;
}

type Row = readonly [left: string, right: string];

// Ids come from the row's position, so rows are only ever appended: inserting, reordering
// or deleting a row would give another pair an id that is already in use.
export function pairs(lang: Lang, rows: readonly Row[]): ScalePair[] {
  return rows.map(([left, right], i) => ({ id: `${lang}-${i + 1}`, left, right }));
}
