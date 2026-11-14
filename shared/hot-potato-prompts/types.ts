// Ready-made tasks for the Hot Potato game. Each language has its own list, written for
// that language rather than translated.

import type { Lang } from "../i18n";

export interface PotatoPrompt {
  /** `<lang>-<n>`: a task's position in its file. */
  id: string;
  text: string;
}

// Ids come from the row's position, so rows are only ever appended: inserting, reordering
// or deleting a row would give another task an id that is already in use.
export function prompts(lang: Lang, rows: readonly string[]): PotatoPrompt[] {
  return rows.map((text, i) => ({ id: `${lang}-${i + 1}`, text }));
}
