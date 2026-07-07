import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createApiClient, type ApiClient } from "./api";
import { exchangeGoogleIdToken, type MobileAuthResponse } from "./auth";
import { getApiUrl } from "./config";
import { clearToken, getToken, setToken } from "./storage";
import type { User } from "@shared/types";

type AuthUser = Pick<User, "id" | "email" | "name" | "avatar_url">;

interface AuthState {
  ready: boolean; // finished restoring token from storage
  isAuthenticated: boolean; // a token is present (fresh sign-in OR restored session)
  user: AuthUser | null; // profile; null after a cold-start restore until re-fetched
  api: ApiClient;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const signOut = useCallback(async () => {
    await clearToken();
    setTok(null);
    setUser(null);
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
