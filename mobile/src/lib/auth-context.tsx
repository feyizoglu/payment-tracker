import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as Device from "expo-device";
import { createApiClient, type ApiClient } from "./api";
import { exchangeGoogleIdToken, fetchProfile, type MobileAuthResponse } from "./auth";
import { getApiUrl } from "./config";
import { registerForPush, unregisterFromPush } from "./push";
import { getNativePushToken, nativePushDeps } from "./push-native";
import { clearToken, getToken, setToken } from "./storage";

// Single source of truth: mirror the exact profile shape the auth endpoint
// returns (defined in ./auth) rather than restating the Pick<User, ...> list.
type AuthUser = MobileAuthResponse["user"];

interface AuthState {
  ready: boolean; // finished restoring token from storage
  isAuthenticated: boolean; // a token is present (fresh sign-in OR restored session)
  user: AuthUser | null; // profile; null after a cold-start restore until re-fetched
  api: ApiClient;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Best-effort, through a client with no onUnauthorized: signOut is itself the 401
// handler, so a rejected JWT must not loop back into it.
function unregisterDevice(jwt: string, knownToken: string | null): Promise<void> {
  const client = createApiClient({ baseUrl: getApiUrl(), getToken: async () => jwt });
  return unregisterFromPush({
    knownToken,
    isDevice: Device.isDevice,
    getPushToken: getNativePushToken,
    del: (path, body) => client.del(path, body),
  }).catch((e) => console.warn("push unregister failed", e));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Refs, not state: signOut must reach the current values without depending on
  // `api`, which itself depends on signOut.
  const jwtRef = useRef<string | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  // The next registration waits for this, or a late DELETE would remove the new row.
  const pendingUnregisterRef = useRef<Promise<void>>(Promise.resolve());

  const signOut = useCallback(async () => {
    // Drop the Google session too, so the next sign-in shows the account
    // chooser instead of silently reusing the last account. Best-effort: if the
    // native side fails (never configured, no Play Services), the local token
    // must still be cleared.
    try {
      await GoogleSignin.signOut();
    } catch {
      // ignore — local sign-out is what actually ends the session
    }
    const pushToken = pushTokenRef.current;
    const jwt = jwtRef.current;
    pushTokenRef.current = null;
    await clearToken();
    setTok(null);
    setUser(null);
    // Stop reminders reaching this phone, without holding up the sign-out. An expired
    // JWT (the 401 path) cannot unregister; the row moves to whoever signs in here next.
    if (jwt) pendingUnregisterRef.current = unregisterDevice(jwt, pushToken);
  }, []);

  // One API client instance; reads the latest token via the closed-over getter.
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: getApiUrl(),
        getToken: async () => token,
        onUnauthorized: signOut,
      }),
    [token, signOut]
  );

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    // A token-less client just for the public sign-in call. It has no
    // onUnauthorized handler on purpose: a bad Google token legitimately 401s
    // here and must not trigger the app's session-expiry sign-out loop.
    const authApi = createApiClient({ baseUrl: getApiUrl(), getToken: async () => null });
    const res = await exchangeGoogleIdToken(
      (path, body) => authApi.post<MobileAuthResponse>(path, body),
      idToken
    );
    await setToken(res.token);
    setTok(res.token);
    setUser(res.user);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getToken();
        if (stored) setTok(stored);
      } catch {
        // A secure-store read failure just means no restored session; fall
        // through to the sign-in screen rather than hanging on the spinner.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // A restored session has a token but no profile. Fetch it, so the screens
  // that key on `user` (the owner-only member picker, the settings colour)
  // work after a cold start instead of waiting for a re-sign-in. A fresh
  // sign-in already set both, so this is a no-op there.
  useEffect(() => {
    if (token == null || user != null) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile((path) => api.get<AuthUser>(path));
        // Sign-out can land while this is in flight; don't resurrect the profile.
        if (!cancelled) setUser(profile);
      } catch {
        // A 401 already ran the client's onUnauthorized (sign-out). Anything
        // else is transient: leave the profile null, exactly as before.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, token, user]);

  useEffect(() => {
    jwtRef.current = token;
  }, [token]);

  // Register this phone for reminders once per signed-in session. Failures are
  // swallowed: notifications are a bonus, never a reason to block the app.
  useEffect(() => {
    if (token == null) return;
    let cancelled = false;
    pendingUnregisterRef.current
      .then(() => (cancelled ? null : registerForPush(nativePushDeps((path, body) => api.post(path, body)))))
      .then((outcome) => {
        if (outcome?.kind !== "registered") return;
        // Signed out while the POST was in flight: it landed after signOut's DELETE.
        if (cancelled) pendingUnregisterRef.current = unregisterDevice(token, outcome.token);
        else pushTokenRef.current = outcome.token;
      })
      .catch((e) => console.warn("push registration failed", e));
    return () => {
      cancelled = true;
    };
    // `api` changes with `token`; keying on token alone avoids a second registration.
  }, [token]);

  // Gate on token presence, not `user`: a restored session has a token but no
  // profile yet. An expired token self-heals — the first 401 triggers signOut.
  const value: AuthState = {
    ready,
    isAuthenticated: token != null,
    user,
    api,
    signInWithGoogleIdToken,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
