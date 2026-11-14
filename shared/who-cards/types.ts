// Cards for the Who Am I? game. People and characters are one bilingual list each, curated
// from Wikidata candidates; things come from the Describe It word lists.

import type { Lang } from "../i18n";

export const WHO_KINDS = ["people", "characters", "things"] as const;
export type WhoKind = (typeof WHO_KINDS)[number];

export const WHO_REGIONS = ["tr", "world"] as const;
export type WhoRegion = (typeof WHO_REGIONS)[number];

export type WhoLevel = "easy" | "hard";

export interface WhoCard {
  /** `<file prefix>-<n>`: a card's position in its file. Seen lists store it. */
  id: string;
  name: Readonly<Record<Lang, string>>;
  hint: Readonly<Record<Lang, string>>;
  region: WhoRegion;
  level: WhoLevel;
}

type Row = readonly [
  nameTr: string,
  nameEn: string,
  region: WhoRegion,
  level: WhoLevel,
  hintTr: string,
  hintEn: string,
];

// Ids come from the row's position, so rows are only ever appended: inserting, reordering
// or deleting a row would give another card an id a device has already seen.
export function cards(prefix: string, rows: readonly Row[]): WhoCard[] {
  return rows.map(([nameTr, nameEn, region, level, hintTr, hintEn], i) => ({
    id: `${prefix}-${i + 1}`,
    name: { tr: nameTr, en: nameEn },
    hint: { tr: hintTr, en: hintEn },
    region,
    level,
  }));
}
