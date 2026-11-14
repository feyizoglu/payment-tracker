import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETUP, SETUP_STORAGE_KEY, parseSavedSetup, type PotatoSetup } from "@ptracker/shared/hot-potato";

// Remembers the Hot Potato players and settings. Fail-soft like imposter-storage.ts: a storage
// error means default settings, never a game that will not open.

export async function getStoredPotatoSetup(): Promise<PotatoSetup> {
  try {
    return parseSavedSetup(await AsyncStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

export async function setStoredPotatoSetup(setup: PotatoSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the names just are not remembered.
  }
}
