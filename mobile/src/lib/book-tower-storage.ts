import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseSavedBest } from "@ptracker/shared/best-score";
import { TOWER_BEST_KEY } from "@ptracker/shared/book-tower";

// Fail-soft like scale-game-storage.ts: a storage error never stops the game.

/** The saved best (0 when none), or null when storage could not be read. */
export async function getStoredTowerBest(): Promise<number | null> {
  try {
    return parseSavedBest(await AsyncStorage.getItem(TOWER_BEST_KEY));
  } catch {
    return null;
  }
}

export async function setStoredTowerBest(best: number): Promise<void> {
  try {
    await AsyncStorage.setItem(TOWER_BEST_KEY, String(best));
  } catch {
    // The score just is not remembered.
  }
}
