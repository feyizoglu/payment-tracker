import { TOWER_BEST_KEY } from "@ptracker/shared/book-tower";
import { getStoredBest, setStoredBest } from "@/lib/best-storage";

export const getStoredTowerBest = () => getStoredBest(TOWER_BEST_KEY);
export const setStoredTowerBest = (best: number) => setStoredBest(TOWER_BEST_KEY, best);
