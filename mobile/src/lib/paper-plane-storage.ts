import { PLANE_BEST_KEY } from "@ptracker/shared/paper-plane";
import { getStoredBest, setStoredBest } from "@/lib/best-storage";

export const getStoredPlaneBest = () => getStoredBest(PLANE_BEST_KEY);
export const setStoredPlaneBest = (best: number) => setStoredBest(PLANE_BEST_KEY, best);
