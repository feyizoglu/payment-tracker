import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETUP, SETUP_STORAGE_KEY, parseSavedSetup, type WolfSetup } from "@ptracker/shared/wolf-game";

// Remembers the Wolf Night players and settings. Fail-soft like imposter-storage.ts: a storage
// error means default settings, never a game that will not open.

export async function getStoredWolfSetup(): Promise<WolfSetup> {
  try {
    return parseSavedSetup(await AsyncStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

export async function setStoredWolfSetup(setup: WolfSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the names just are not remembered.
  }
}
