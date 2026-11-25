import { HUNT_BEST_KEY } from "@ptracker/shared/bill-hunt";
import { getStoredBest, setStoredBest } from "@/lib/best-storage";

export const getStoredHuntBest = () => getStoredBest(HUNT_BEST_KEY);
export const setStoredHuntBest = (best: number) => setStoredBest(HUNT_BEST_KEY, best);
