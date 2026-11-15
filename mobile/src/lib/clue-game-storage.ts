import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@ptracker/shared/i18n";
import {
  CLUE_SETUP_STORAGE_KEY,
  clueSeenKey,
  defaultClueSetup,
  parseSavedClueSeen,
  parseSavedClueSetup,
  type ClueSetup,
} from "@ptracker/shared/clue-game";

// One Clue's settings and its seen list per language. Fail-soft like imposter-storage.ts:
// a storage error means defaults, never a game that will not open.

export async function getStoredClueSetup(): Promise<ClueSetup> {
  try {
    return parseSavedClueSetup(await AsyncStorage.getItem(CLUE_SETUP_STORAGE_KEY));
  } catch {
    return defaultClueSetup();
  }
}

export async function setStoredClueSetup(setup: ClueSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(CLUE_SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the players just are not remembered.
  }
}

export async function getStoredClueSeen(lang: Lang): Promise<string[]> {
  try {
    return parseSavedClueSeen(await AsyncStorage.getItem(clueSeenKey(lang)));
  } catch {
    return [];
  }
}

export async function setStoredClueSeen(lang: Lang, seen: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(clueSeenKey(lang), JSON.stringify(seen));
  } catch {
    // Non-fatal: words may come back sooner.
  }
}
