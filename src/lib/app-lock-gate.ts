import { hasPin, type AppLockState } from "@/lib/app-lock";

export type LockScreen = "none" | "game" | "economy";

function inGames(path: string): boolean {
  return path === "/games" || path.startsWith("/games/");
}

export function lockScreenFor(path: string, state: AppLockState, economyUnlocked: boolean): LockScreen {
  if (!hasPin(state) || path === "/") return "none";
  if (state.gameMode) return inGames(path) ? "none" : "game";
  const inEconomy = path === "/economy" || path.startsWith("/economy/");
  if (inEconomy && state.economyLock && !economyUnlocked) return "economy";
  return "none";
}

/** Pages that never lock, so they may render before the stored lock has been read. */
export function rendersBeforeLockRead(path: string): boolean {
  return path === "/" || inGames(path);
}
