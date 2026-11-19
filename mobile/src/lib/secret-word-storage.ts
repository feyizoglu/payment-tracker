import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@ptracker/shared/i18n";
import { SECRET_BEST_KEY, secretSeenKey } from "@ptracker/shared/secret-word";
import { parseSavedSeen } from "@ptracker/shared/word-game";
import { getStoredBest, setStoredBest } from "@/lib/best-storage";

// Fail-soft like word-game-storage.ts: a storage error never stops the game.

export const getStoredSecretBest = () => getStoredBest(SECRET_BEST_KEY);
export const setStoredSecretBest = (best: number) => setStoredBest(SECRET_BEST_KEY, best);

export async function getStoredSecretSeen(lang: Lang): Promise<string[]> {
  try {
    return parseSavedSeen(await AsyncStorage.getItem(secretSeenKey(lang)));
  } catch {
    return [];
  }
}

export async function setStoredSecretSeen(lang: Lang, seen: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(secretSeenKey(lang), JSON.stringify(seen));
  } catch {
    // Words may just come back sooner.
  }
}
