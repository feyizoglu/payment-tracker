import type { User } from "@ptracker/shared/types";

export interface MobileAuthResponse {
  token: string;
  user: Pick<User, "id" | "email" | "name" | "avatar_url">;
}

// Exchanges a Google ID token for an app JWT via POST /api/auth/mobile.
// `post` is injected (the API client's post) so this stays unit-testable.
//
// IMPORTANT: pass a `post` from a token-less API client that does NOT have an
// `onUnauthorized` handler. This endpoint legitimately returns 401 for a bad
// Google token; routing that through the app's session-expiry handler would
// trigger a spurious re-sign-in loop during a fresh, failed first sign-in.
export async function exchangeGoogleIdToken(
  post: (path: string, body: unknown) => Promise<MobileAuthResponse>,
  idToken: string
): Promise<MobileAuthResponse> {
  if (!idToken) {
    throw new Error("Missing Google ID token");
  }
  return post("/api/auth/mobile", { id_token: idToken });
}

// Loads the signed-in user's profile via GET /api/users/me. Used after a
// cold start, where the restored JWT proves who the caller is but carries no
// profile. `get` is injected (the API client's get) so this stays unit-testable.
//
// Errors are deliberately propagated, not swallowed: the caller decides. A 401
// already runs the client's `onUnauthorized` (sign-out); anything else is a
// transient failure the app can ride out with a null profile.
export async function fetchProfile(
  get: (path: string) => Promise<MobileAuthResponse["user"]>
): Promise<MobileAuthResponse["user"]> {
  return get("/api/users/me");
}
