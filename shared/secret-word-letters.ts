// Secret Word's letters. Kept apart from secret-word.ts so the word-list builder does not load the
// lists it writes.

import type { Lang } from "./i18n";

export const SECRET_LEN = 5;

export const SECRET_ALPHABET: Record<Lang, readonly string[]> = {
  tr: [..."ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"],
  en: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
};

/** Upper case without the runtime's locale, which Hermes may not honour: Turkish i is İ, ı is I. */
export function secretUpper(text: string, lang: Lang): string {
  const mapped = lang === "tr" ? text.replace(/i/g, "İ").replace(/ı/g, "I") : text;
  return mapped.toUpperCase();
}
