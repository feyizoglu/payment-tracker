import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLANE_BEST_KEY, parseSavedBest } from "@ptracker/shared/paper-plane";

// Fail-soft like scale-game-storage.ts: a storage error never stops the game.

/** The saved best (0 when none), or null when storage could not be read. */
export async function getStoredPlaneBest(): Promise<number | null> {
  try {
    return parseSavedBest(await AsyncStorage.getItem(PLANE_BEST_KEY));
  } catch {
    return null;
  }
}

export async function setStoredPlaneBest(best: number): Promise<void> {
  try {
    await AsyncStorage.setItem(PLANE_BEST_KEY, String(best));
  } catch {
    // The score just is not remembered.
  }
}
