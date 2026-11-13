import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@ptracker/shared/i18n";
import {
  WORD_SETUP_STORAGE_KEY,
  defaultWordSetup,
  parseSavedSeen,
  parseSavedWordSetup,
  wordSeenKey,
  type WordSetup,
} from "@ptracker/shared/word-game";

// The word game's settings and its seen list per language. Fail-soft like
// imposter-storage.ts: a storage error means defaults, never a game that will not open.

export async function getStoredWordSetup(teamNames: readonly [string, string]): Promise<WordSetup> {
  try {
    return parseSavedWordSetup(await AsyncStorage.getItem(WORD_SETUP_STORAGE_KEY), teamNames);
  } catch {
    return defaultWordSetup(teamNames);
  }
}

export async function setStoredWordSetup(setup: WordSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(WORD_SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the teams just are not remembered.
  }
}

export async function getStoredSeen(lang: Lang): Promise<string[]> {
  try {
    return parseSavedSeen(await AsyncStorage.getItem(wordSeenKey(lang)));
  } catch {
    return [];
  }
}

export async function setStoredSeen(lang: Lang, seen: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(wordSeenKey(lang), JSON.stringify(seen));
  } catch {
    // Non-fatal: words may come back sooner.
  }
}
