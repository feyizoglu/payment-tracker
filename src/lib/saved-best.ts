import { parseSavedBest } from "@/lib/best-score";

/** The best saved under `key`, or null when the browser refuses to read storage. */
export function readSavedBest(key: string): number | null {
  try {
    return parseSavedBest(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeSavedBest(key: string, best: number) {
  try {
    localStorage.setItem(key, String(best));
  } catch {
    // Private mode or full storage: the game still runs, it just forgets.
  }
}
