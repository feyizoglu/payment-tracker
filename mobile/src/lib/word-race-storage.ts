import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VocabWord } from "@ptracker/shared/vocab";
import { RACE_BEST_KEY, RACE_LIST_KEY, parseRaceList } from "@ptracker/shared/word-race";
import { getStoredBest, setStoredBest } from "@/lib/best-storage";

// Fail-soft like best-storage.ts: a storage error never stops the race.

export const getStoredRaceBest = () => getStoredBest(RACE_BEST_KEY);
export const setStoredRaceBest = (best: number) => setStoredBest(RACE_BEST_KEY, best);

/** The list saved by the last successful read; null when none, broken, or another user's. */
export async function getStoredRaceList(userId: string | null): Promise<VocabWord[] | null> {
  try {
    return parseRaceList(await AsyncStorage.getItem(RACE_LIST_KEY), userId);
  } catch {
    return null;
  }
}

export async function setStoredRaceList(words: readonly VocabWord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RACE_LIST_KEY, JSON.stringify(words));
  } catch {
    // The race just needs a connection next time.
  }
}

export async function clearStoredRaceList(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RACE_LIST_KEY);
  } catch {
    // Nothing more to do: the copy is ignored for any other signed-in user once their profile loads.
  }
}
