// Games need a signed-in user, but offline the session cannot be checked. A device that
// was signed in the last time it was online may still play, like the mobile app does.
export const GAMES_SIGNED_IN_KEY = "games_signed_in";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";
export type GamesAccess = "allow" | "wait" | "signin";

export function gamesAccess(status: SessionStatus, online: boolean, remembered: boolean): GamesAccess {
  if (status === "authenticated") return "allow";
  if (!online && remembered) return "allow";
  if (status === "loading") return "wait";
  return "signin";
}

export function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(GAMES_SIGNED_IN_KEY, "1");
    else localStorage.removeItem(GAMES_SIGNED_IN_KEY);
  } catch {
    // Without storage the device simply is not remembered for offline play.
  }
}

export function isRememberedSignedIn(): boolean {
  try {
    return localStorage.getItem(GAMES_SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}
