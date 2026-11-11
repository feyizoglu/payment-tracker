// Games need a signed-in user, but offline the session cannot be checked. A device that
// was signed in the last time it was online may still play, like the mobile app does.
export const GAMES_SIGNED_IN_KEY = "games_signed_in";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";
export type SessionCheck = "pending" | "active" | "none" | "unreachable";
export type GamesAccess = "allow" | "wait" | "signin";

// next-auth reports a failed session request as "unauthenticated" too, so a remembered device
// is only sent to sign in once the server itself answered that there is no session.
export function gamesAccess(
  status: SessionStatus,
  online: boolean,
  remembered: boolean,
  sessionCheck: SessionCheck
): GamesAccess {
  if (status === "authenticated") return "allow";
  if (!remembered) return status === "loading" ? "wait" : "signin";
  if (!online) return "allow";
  if (status === "loading" || sessionCheck === "pending") return "wait";
  return sessionCheck === "none" ? "signin" : "allow";
}

export function needsSessionCheck(status: SessionStatus, online: boolean, remembered: boolean): boolean {
  return status === "unauthenticated" && online && remembered;
}

export async function checkSession(): Promise<Exclude<SessionCheck, "pending">> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return "unreachable";
    const session: unknown = await response.json();
    const user = session && typeof session === "object" && "user" in session ? session.user : null;
    return user ? "active" : "none";
  } catch {
    return "unreachable";
  }
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
