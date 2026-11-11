import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETUP, SETUP_STORAGE_KEY, parseSavedSetup, type ImposterSetup } from "@ptracker/shared/imposter";

// Remembers the player list and game settings. Fail-soft like language-storage.ts: a
// storage error means default settings, never a game that will not open.

export async function getStoredSetup(): Promise<ImposterSetup> {
  try {
    return parseSavedSetup(await AsyncStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

export async function setStoredSetup(setup: ImposterSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the names just are not remembered.
  }
}
