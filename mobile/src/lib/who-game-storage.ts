import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@ptracker/shared/i18n";
import {
  WHO_SETUP_STORAGE_KEY,
  defaultWhoSetup,
  parseSavedWhoSeen,
  parseSavedWhoSetup,
  whoSeenKey,
  type WhoSetup,
} from "@ptracker/shared/who-game";

// Who Am I?'s settings and its seen list per language. Fail-soft like imposter-storage.ts:
// a storage error means defaults, never a game that will not open.

export async function getStoredWhoSetup(lang: Lang, teamNames: readonly [string, string]): Promise<WhoSetup> {
  try {
    return parseSavedWhoSetup(await AsyncStorage.getItem(WHO_SETUP_STORAGE_KEY), lang, teamNames);
  } catch {
    return defaultWhoSetup(lang, teamNames);
  }
}

export async function setStoredWhoSetup(setup: WhoSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(WHO_SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the players just are not remembered.
  }
}

export async function getStoredWhoSeen(lang: Lang): Promise<string[]> {
  try {
    return parseSavedWhoSeen(await AsyncStorage.getItem(whoSeenKey(lang)));
  } catch {
    return [];
  }
}

export async function setStoredWhoSeen(lang: Lang, seen: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(whoSeenKey(lang), JSON.stringify(seen));
  } catch {
    // Non-fatal: cards may come back sooner.
  }
}
