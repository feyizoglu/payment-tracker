import type { User } from "@shared/types";

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
