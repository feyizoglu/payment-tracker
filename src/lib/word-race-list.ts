import type { VocabWord } from "@/lib/vocab";
import { RACE_LIST_KEY, parseRaceList } from "@/lib/word-race";

/** The word list saved by the last successful read, or null when there is none for this user. */
export function readRaceList(userId: string | null): VocabWord[] | null {
  try {
    return parseRaceList(localStorage.getItem(RACE_LIST_KEY), userId);
  } catch {
    return null;
  }
}

export function writeRaceList(words: readonly VocabWord[]) {
  try {
    localStorage.setItem(RACE_LIST_KEY, JSON.stringify(words));
  } catch {
    // Private mode or full storage: the race just needs a connection next time.
  }
}
