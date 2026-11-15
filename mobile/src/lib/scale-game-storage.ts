import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@ptracker/shared/i18n";
import {
  SCALE_SETUP_STORAGE_KEY,
  defaultScaleSetup,
  parseSavedScaleSeen,
  parseSavedScaleSetup,
  scaleSeenKey,
  type ScaleSetup,
} from "@ptracker/shared/scale-game";

// Scale's settings and its pairs played per language. Fail-soft like imposter-storage.ts: a storage error means defaults, never a
// game that will not open.

export async function getStoredScaleSetup(teamNames: readonly [string, string]): Promise<ScaleSetup> {
  try {
    return parseSavedScaleSetup(await AsyncStorage.getItem(SCALE_SETUP_STORAGE_KEY), teamNames);
  } catch {
    return defaultScaleSetup(teamNames);
  }
}

export async function setStoredScaleSetup(setup: ScaleSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(SCALE_SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the teams just are not remembered.
  }
}

export async function getStoredScaleSeen(lang: Lang): Promise<string[]> {
  try {
    return parseSavedScaleSeen(await AsyncStorage.getItem(scaleSeenKey(lang)));
  } catch {
    return [];
  }
}

export async function setStoredScaleSeen(lang: Lang, seen: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(scaleSeenKey(lang), JSON.stringify(seen));
  } catch {
    // Non-fatal: pairs may come back sooner.
  }
}
