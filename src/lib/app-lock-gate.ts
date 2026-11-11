import { hasPin, type AppLockState } from "@/lib/app-lock";

export type LockScreen = "none" | "game" | "economy";

export function lockScreenFor(path: string, state: AppLockState, economyUnlocked: boolean): LockScreen {
  if (!hasPin(state) || path === "/") return "none";
  const inGames = path === "/games" || path.startsWith("/games/");
  if (state.gameMode) return inGames ? "none" : "game";
  const inEconomy = path === "/economy" || path.startsWith("/economy/");
  if (inEconomy && state.economyLock && !economyUnlocked) return "economy";
  return "none";
}
