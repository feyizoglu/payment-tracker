import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseSavedBest } from "@ptracker/shared/best-score";

// Fail-soft like scale-game-storage.ts: a storage error never stops the game.

/** The best saved under `key` (0 when none), or null when storage could not be read. */
export async function getStoredBest(key: string): Promise<number | null> {
  try {
    return parseSavedBest(await AsyncStorage.getItem(key));
  } catch {
    return null;
  }
}

export async function setStoredBest(key: string, best: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(best));
  } catch {
    // The score just is not remembered.
  }
}
