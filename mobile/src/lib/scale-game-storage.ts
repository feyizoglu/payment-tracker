import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SCALE_SETUP_STORAGE_KEY,
  defaultScaleSetup,
  parseSavedScaleSetup,
  type ScaleSetup,
} from "@ptracker/shared/scale-game";

// Scale's settings. Fail-soft like imposter-storage.ts: a storage error means defaults, never a
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
