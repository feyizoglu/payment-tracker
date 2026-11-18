import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLANE_BEST_KEY, parseSavedBest } from "@ptracker/shared/paper-plane";

// Fail-soft like scale-game-storage.ts: a storage error means a best of 0, never a game that will not open.

export async function getStoredPlaneBest(): Promise<number> {
  try {
    return parseSavedBest(await AsyncStorage.getItem(PLANE_BEST_KEY));
  } catch {
    return 0;
  }
}

export async function setStoredPlaneBest(best: number): Promise<void> {
  try {
    await AsyncStorage.setItem(PLANE_BEST_KEY, String(best));
  } catch {
    // The score just is not remembered.
  }
}
