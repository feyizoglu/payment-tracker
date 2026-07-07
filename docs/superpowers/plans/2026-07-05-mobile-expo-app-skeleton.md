# Mobile Expo App Skeleton Implementation Plan (Plan 2/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo (React Native) app in `mobile/`, wired to `shared/`, with a testable API client, secure-store token storage, native Google sign-in, and a Payments home screen that lists the signed-in user's payments from the existing Next.js API.

**Architecture:** A self-contained Expo Router app lives in `mobile/` with its own `package.json`, isolated from the root Next.js tooling (root `tsconfig`/eslint exclude it). It talks only to `https://<vercel-domain>/api/*` using a `Bearer <app-jwt>` obtained from `POST /api/auth/mobile` (backend built in Plan 1). Pure, injectable logic (API client, Google-token exchange) is unit-tested with Vitest; UI screens are verified by bundling + `tsc`. Real native Google sign-in and push require an EAS dev build (Plan 4) — this plan wires the flow and unit-tests its logic.

**Tech Stack:** Expo SDK (latest) + Expo Router, TypeScript, NativeWind (Tailwind for RN), `expo-auth-session` (Google), `expo-secure-store`, Vitest (mobile unit tests). Backend endpoints unchanged.

---

## Prerequisites (manual, one-time — do before Task 1)

These are the engineer's responsibility and are NOT code steps:

1. **Node & Expo:** Node ≥ 20 installed. No global install needed; commands use `npx`.
2. **Deployed API URL:** The Vercel deployment URL of this project (e.g. `https://payment-tracker-xxxx.vercel.app`). Used as `EXPO_PUBLIC_API_URL`.
3. **Google Web client ID:** The existing web OAuth client ID = the `AUTH_GOOGLE_ID` value already configured on Vercel. This is a **public** client ID (not a secret), used as `EXPO_PUBLIC_GOOGLE_CLIENT_ID`. Per the design spec (Seçenek A), the mobile ID token's `aud` will be this web client ID, which `verifyGoogleIdToken` already accepts via `AUTH_GOOGLE_ID` — so **no new server env var is required for this plan**. The Android OAuth client (package name + SHA‑1) and, optionally, `GOOGLE_MOBILE_CLIENT_IDS` are created later in Plan 4 once EAS produces a signing keystore.
4. **Android package name decision:** This plan uses `com.tolgahan.paymenttracker`. If you prefer another, change it consistently in `mobile/app.json` and remember it for Plan 4's Android OAuth client.

> **Scope note:** Real Google sign-in and push notifications need a **dev build** (Expo Go cannot do native Google auth), which is Plan 4. This plan is complete when: mobile unit tests pass, `tsc` is clean, the bundler builds, and the app boots to the sign-in screen with the Google button present and its token-exchange logic unit-tested.

---

## File Structure

**New files (all under `mobile/` unless noted):**

- `mobile/package.json` — Expo app deps + `test` script (Vitest). Independent from root.
- `mobile/app.json` — Expo config: name, scheme `paymenttracker`, `android.package`, plugins.
- `mobile/tsconfig.json` — extends Expo base; path alias `@shared/*` → `../shared/*`, `@/*` → `./`.
- `mobile/metro.config.js` — `watchFolders` includes repo root so Metro can resolve `../shared`.
- `mobile/babel.config.js` — `babel-preset-expo` + NativeWind jsxImportSource.
- `mobile/tailwind.config.js` — NativeWind preset + the app color palette.
- `mobile/global.css` — Tailwind directives.
- `mobile/nativewind-env.d.ts` — NativeWind TS types.
- `mobile/vitest.config.ts` — node env, includes `lib/**/*.test.ts`, alias `@shared`.
- `mobile/.env.example` — documents `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.
- `mobile/lib/config.ts` — reads public env; exposes `API_URL`, `GOOGLE_CLIENT_ID`.
- `mobile/lib/storage.ts` — thin `expo-secure-store` wrapper for the app JWT.
- `mobile/lib/api.ts` — injectable fetch client: Bearer injection, 401 hook, `ApiError`.
- `mobile/lib/auth.ts` — `exchangeGoogleIdToken()` token-exchange logic (injectable).
- `mobile/lib/auth-context.tsx` — React context: holds token/user, sign-in/sign-out, builds the API client.
- `mobile/app/_layout.tsx` — root layout: wraps app in `AuthProvider`, gates to sign-in vs tabs.
- `mobile/app/sign-in.tsx` — Google sign-in screen.
- `mobile/app/(tabs)/_layout.tsx` — bottom tabs (Payments tab now; others are Plan 3 stubs).
- `mobile/app/(tabs)/index.tsx` — Payments home screen: lists payments from `GET /api/payments`.

**Modified files (root):**

- `tsconfig.json` — add `"mobile"` to `exclude` so `next build`/`tsc` ignore RN code.
- `eslint.config.mjs` — ignore `mobile/**` at root (mobile lints itself).

---

## Task 1: Scaffold the Expo app and isolate it from root tooling

Creates the Expo app and, critically, stops the root Next.js `tsc`/eslint from trying to compile React Native code.

**Files:**
- Create: `mobile/**` (via scaffold), `mobile/tsconfig.json`, `mobile/metro.config.js`, `mobile/app.json`
- Modify: `tsconfig.json` (root), `eslint.config.mjs` (root)

- [ ] **Step 1: Scaffold the Expo app with the default (Expo Router) template**

Run from the repo root:

```bash
npx create-expo-app@latest mobile --template default --no-install
```

Expected: a `mobile/` directory is created with `app/`, `package.json`, `app.json`, `tsconfig.json`, etc. `--no-install` skips node_modules for now (installed in Step 4).

- [ ] **Step 2: Verify the root Next.js build currently still passes (baseline, before isolation)**

Run: `npx tsc --noEmit`
Expected: this will likely now FAIL or emit errors from `mobile/**` because root `tsconfig.json` includes `**/*.ts(x)`. Note the failure — Step 3 fixes it. (If it happens to pass because deps aren't installed, proceed anyway.)

- [ ] **Step 3: Exclude `mobile/` from the root tsconfig**

Edit root `tsconfig.json`, change the `exclude` array:

```json
  "exclude": ["node_modules", "mobile"]
```

- [ ] **Step 4: Ignore `mobile/` in the root ESLint flat config**

Edit root `eslint.config.mjs`. Add an ignores entry as the FIRST array element (flat-config global ignore):

```js
  {
    ignores: ["mobile/**"],
  },
```

(Insert it inside the exported config array, before the existing entries. Keep existing entries unchanged.)

- [ ] **Step 5: Replace `mobile/tsconfig.json` with shared-aware config**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"],
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 6: Create `mobile/metro.config.js` so Metro can resolve `../shared`**

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
// Let Metro watch the repo root so imports from ../shared resolve.
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
];

module.exports = config;
```

- [ ] **Step 7: Set app identity in `mobile/app.json`**

In `mobile/app.json`, under `expo`, ensure these keys (merge with generated values, don't delete `name`/`slug`/`version`):

```json
    "scheme": "paymenttracker",
    "android": {
      "package": "com.tolgahan.paymenttracker",
      "adaptiveIcon": {
        "backgroundColor": "#ffffff"
      }
    }
```

- [ ] **Step 8: Install mobile dependencies**

Run:

```bash
cd mobile && npm install
```

Expected: `mobile/node_modules` created, no fatal errors.

- [ ] **Step 9: Verify root tooling is clean and mobile bundles**

Run from repo root:

```bash
npx tsc --noEmit && npm test
```

Expected: root `tsc` PASSES (no `mobile/**` errors) and root Vitest suite PASSES (still `src/**` only).

Then run:

```bash
cd mobile && npx tsc --noEmit
```

Expected: mobile `tsc` PASSES.

- [ ] **Step 10: Commit**

```bash
git add mobile tsconfig.json eslint.config.mjs
git commit -m "feat(mobile): scaffold Expo app and isolate from root tooling"
```

---

## Task 2: NativeWind styling setup

Wires Tailwind-for-RN so screens can use `className`. Carries over the app's neutral palette.

**Files:**
- Create: `mobile/tailwind.config.js`, `mobile/global.css`, `mobile/nativewind-env.d.ts`
- Modify: `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/app/_layout.tsx`

- [ ] **Step 1: Install NativeWind + Tailwind**

```bash
cd mobile && npm install nativewind && npm install --save-dev tailwindcss@^3
```

- [ ] **Step 2: Create `mobile/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Mirror the web app's neutral palette; refine to match src later.
        brand: {
          DEFAULT: "#2563eb",
          fg: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create `mobile/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Create `mobile/nativewind-env.d.ts`**

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 5: Update `mobile/babel.config.js` for NativeWind**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **Step 6: Wire the CSS through Metro**

In `mobile/metro.config.js`, wrap the exported config with NativeWind. Replace the final `module.exports = config;` line with:

```js
const { withNativeWind } = require("nativewind/metro");
module.exports = withNativeWind(config, { input: "./global.css" });
```

- [ ] **Step 7: Import the stylesheet in the root layout**

At the top of `mobile/app/_layout.tsx` add:

```tsx
import "../global.css";
```

- [ ] **Step 8: Add a smoke-test styled view to the default index screen**

In `mobile/app/(tabs)/index.tsx` (generated by the template), confirm a `className` renders by adding a styled `Text` (temporary — replaced in Task 9). Example minimal body:

```tsx
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-brand text-lg font-semibold">Payment Tracker</Text>
    </View>
  );
}
```

- [ ] **Step 9: Verify it bundles and types check**

```bash
cd mobile && npx tsc --noEmit
```

Expected: PASS. (Optional manual: `npx expo start` and open in Expo Go — the styled text is centered. Not required for the gate.)

- [ ] **Step 10: Commit**

```bash
git add mobile
git commit -m "feat(mobile): add NativeWind styling"
```

---

## Task 3: Mobile unit-test harness

Adds Vitest to the mobile package so the pure logic in Tasks 4–6 can be TDD'd. Kept separate from the root Vitest (which stays `src/**`-only).

**Files:**
- Create: `mobile/vitest.config.ts`
- Modify: `mobile/package.json`

- [ ] **Step 1: Install Vitest in the mobile package**

```bash
cd mobile && npm install --save-dev vitest
```

- [ ] **Step 2: Create `mobile/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add a `test` script to `mobile/package.json`**

In `mobile/package.json` `scripts`, add:

```json
    "test": "vitest run"
```

- [ ] **Step 4: Add a trivial passing test to prove the harness runs**

Create `mobile/lib/harness.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("mobile test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `cd mobile && npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Remove the placeholder test and commit**

```bash
cd mobile && rm lib/harness.test.ts
cd .. && git add mobile
git commit -m "chore(mobile): add Vitest unit-test harness"
```

---

## Task 4: Config and secure-store token storage

`config.ts` centralizes public env; `storage.ts` isolates `expo-secure-store` behind a tiny, mockable interface.

**Files:**
- Create: `mobile/lib/config.ts`, `mobile/lib/storage.ts`, `mobile/.env.example`, `mobile/lib/config.test.ts`
- Modify: none

- [ ] **Step 1: Write the failing test for `config.ts`**

Create `mobile/lib/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.com";
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = "web-client-id";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("exposes API_URL without a trailing slash", async () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.com/";
    const { getApiUrl } = await import("./config");
    expect(getApiUrl()).toBe("https://api.example.com");
  });

  it("throws a clear error when EXPO_PUBLIC_API_URL is missing", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { getApiUrl } = await import("./config");
    expect(() => getApiUrl()).toThrow("EXPO_PUBLIC_API_URL");
  });

  it("exposes the Google client id", async () => {
    const { getGoogleClientId } = await import("./config");
    expect(getGoogleClientId()).toBe("web-client-id");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd mobile && npx vitest run lib/config.test.ts`
Expected: FAIL — `./config` does not exist.

- [ ] **Step 3: Implement `mobile/lib/config.ts`**

```ts
// Public (EXPO_PUBLIC_*) values only — these are bundled into the app and are
// NOT secrets. The app JWT and any real secrets never live here.

// Read at call time (not module load) so tests can vary the environment.
export function getApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set — copy mobile/.env.example to mobile/.env"
    );
  }
  return url.replace(/\/+$/, "");
}

export function getGoogleClientId(): string {
  const id = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error("EXPO_PUBLIC_GOOGLE_CLIENT_ID is not set");
  }
  return id;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd mobile && npx vitest run lib/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `mobile/lib/storage.ts` (thin secure-store wrapper)**

```ts
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "app_jwt";

// Thin wrapper around expo-secure-store so the rest of the app never imports
// the native module directly (keeps auth logic mockable/testable).
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
```

- [ ] **Step 6: Ensure `expo-secure-store` is installed**

```bash
cd mobile && npx expo install expo-secure-store
```

- [ ] **Step 7: Create `mobile/.env.example`**

```bash
# Public config — bundled into the app, not secrets.
EXPO_PUBLIC_API_URL=https://your-vercel-deployment.vercel.app
# The existing web Google OAuth client id (same value as AUTH_GOOGLE_ID on Vercel).
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

- [ ] **Step 8: Verify types and tests**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd .. && git add mobile
git commit -m "feat(mobile): add config and secure-store token storage"
```

---

## Task 5: API client with Bearer injection and 401 handling

A pure, injectable fetch wrapper — the single choke point for all API calls (spec §6). Fully unit-testable with a fake fetch.

**Files:**
- Create: `mobile/lib/api.ts`, `mobile/lib/api.test.ts`
- Modify: none

- [ ] **Step 1: Write the failing tests**

Create `mobile/lib/api.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createApiClient, ApiError } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("attaches a Bearer token and parses JSON on GET", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ id: "p1" }]));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "tok-123",
      fetchImpl,
    });
    const data = await client.get<Array<{ id: string }>>("/api/payments");
    expect(data).toEqual([{ id: "p1" }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/payments");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok-123");
  });

  it("omits the Authorization header when there is no token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await client.get("/api/payments");
    const init = fetchImpl.mock.calls[0][1];
    expect(new Headers(init.headers).get("authorization")).toBeNull();
  });

  it("serializes the body and sets content-type on POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ token: "t" }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await client.post("/api/auth/mobile", { id_token: "g" });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ id_token: "g" }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("calls onUnauthorized and throws ApiError(401) on a 401", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => "expired",
      onUnauthorized,
      fetchImpl,
    });
    await expect(client.get("/api/payments")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("throws ApiError with the body text on a non-ok, non-401 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await expect(client.get("/api/payments")).rejects.toMatchObject({
      status: 500,
      message: "boom",
    });
  });

  it("returns undefined for a 204 No Content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await expect(client.del("/api/payments/p1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx vitest run lib/api.test.ts`
Expected: FAIL — `./api` does not exist.

- [ ] **Step 3: Implement `mobile/lib/api.ts`**

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  // Called once when the server rejects the token; the app re-runs sign-in.
  onUnauthorized?: () => void | Promise<void>;
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await opts.getToken();
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const res = await doFetch(`${opts.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401) {
      await opts.onUnauthorized?.();
      throw new ApiError(401, "unauthorized");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError(res.status, text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get<T>(path: string) {
      return request<T>(path);
    },
    post<T>(path: string, body: unknown) {
      return request<T>(path, { method: "POST", body: JSON.stringify(body) });
    },
    patch<T>(path: string, body: unknown) {
      return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
    },
    del<T>(path: string) {
      return request<T>(path, { method: "DELETE" });
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx vitest run lib/api.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd .. && git add mobile
git commit -m "feat(mobile): add API client with Bearer auth and 401 handling"
```

---

## Task 6: Google ID-token exchange logic

Isolates the `POST /api/auth/mobile` call (Plan 1 endpoint) into a pure, testable function. Matches the real endpoint contract: request `{ id_token }`, response `{ token, user }`.

**Files:**
- Create: `mobile/lib/auth.ts`, `mobile/lib/auth.test.ts`
- Modify: none

- [ ] **Step 1: Write the failing tests**

Create `mobile/lib/auth.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { exchangeGoogleIdToken } from "./auth";

describe("exchangeGoogleIdToken", () => {
  it("posts the id_token and returns token + user", async () => {
    const post = vi.fn().mockResolvedValue({
      token: "app-jwt",
      user: { id: "u1", email: "a@b.com", name: "A", avatar_url: null },
    });
    const result = await exchangeGoogleIdToken(post, "google-id-token");
    expect(post).toHaveBeenCalledWith("/api/auth/mobile", { id_token: "google-id-token" });
    expect(result).toEqual({
      token: "app-jwt",
      user: { id: "u1", email: "a@b.com", name: "A", avatar_url: null },
    });
  });

  it("throws before calling the API when the id token is empty", async () => {
    const post = vi.fn();
    await expect(exchangeGoogleIdToken(post, "")).rejects.toThrow("Google ID token");
    expect(post).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx vitest run lib/auth.test.ts`
Expected: FAIL — `./auth` does not exist.

- [ ] **Step 3: Implement `mobile/lib/auth.ts`**

```ts
import type { User } from "@shared/types";

export interface MobileAuthResponse {
  token: string;
  user: Pick<User, "id" | "email" | "name" | "avatar_url">;
}

// Exchanges a Google ID token for an app JWT via POST /api/auth/mobile.
// `post` is injected (the API client's post) so this stays unit-testable.
export async function exchangeGoogleIdToken(
  post: (path: string, body: unknown) => Promise<MobileAuthResponse>,
  idToken: string
): Promise<MobileAuthResponse> {
  if (!idToken) {
    throw new Error("Missing Google ID token");
  }
  return post("/api/auth/mobile", { id_token: idToken });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx vitest run lib/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify `@shared/types` resolves under mobile tsc**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS (confirms the `@shared/*` path + Metro/tsconfig wiring imports `User` from `../shared/types`).

- [ ] **Step 6: Commit**

```bash
cd .. && git add mobile
git commit -m "feat(mobile): add Google ID-token exchange logic"
```

---

## Task 7: Auth context provider

Holds token/user state, restores the token from secure store on boot, exposes `signIn`/`signOut`, and builds the API client whose `onUnauthorized` clears state. This is glue (imports native modules) — verified by `tsc` + bundling, not unit tests.

**Files:**
- Create: `mobile/lib/auth-context.tsx`
- Modify: none

- [ ] **Step 1: Implement `mobile/lib/auth-context.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createApiClient, type ApiClient } from "./api";
import { exchangeGoogleIdToken, type MobileAuthResponse } from "./auth";
import { getApiUrl } from "./config";
import { clearToken, getToken, setToken } from "./storage";
import type { User } from "@shared/types";

type AuthUser = Pick<User, "id" | "email" | "name" | "avatar_url">;

interface AuthState {
  ready: boolean; // finished restoring token from storage
  user: AuthUser | null;
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

  // One API client instance; reads the latest token via a ref-like getter.
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: getApiUrl(),
        getToken: async () => token,
        onUnauthorized: signOut,
      }),
    [token, signOut]
  );

  const signInWithGoogleIdToken = useCallback(
    async (idToken: string) => {
      // A token-less client just for the public sign-in call.
      const authApi = createApiClient({ baseUrl: getApiUrl(), getToken: async () => null });
      const res = await exchangeGoogleIdToken(
        (path, body) => authApi.post<MobileAuthResponse>(path, body),
        idToken
      );
      await setToken(res.token);
      setTok(res.token);
      setUser(res.user);
    },
    []
  );

  useEffect(() => {
    (async () => {
      const stored = await getToken();
      if (stored) setTok(stored);
      setReady(true);
    })();
  }, []);

  const value: AuthState = { ready, user, api, signInWithGoogleIdToken, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Verify it types and bundles**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd .. && git add mobile
git commit -m "feat(mobile): add auth context provider"
```

---

## Task 8: Sign-in screen and root auth gate

Root layout wraps everything in `AuthProvider` and routes to `sign-in` when signed out, tabs when signed in. The sign-in screen runs the Google flow via `expo-auth-session` and calls `signInWithGoogleIdToken`.

> **Verification reality:** The actual Google prompt requires an EAS dev build (Plan 4); in Expo Go the button renders but the native flow won't complete. This task is verified by `tsc` + bundling + the redirect gate behavior. The exchange logic it calls is already unit-tested (Task 6).

**Files:**
- Create: `mobile/app/sign-in.tsx`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Install auth-session deps**

```bash
cd mobile && npx expo install expo-auth-session expo-web-browser expo-crypto
```

- [ ] **Step 2: Replace `mobile/app/_layout.tsx` with an auth-gated root layout**

```tsx
import "../global.css";
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "../lib/auth-context";

function AuthGate() {
  const { ready, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === "sign-in";
    if (!user && !inAuthGroup) {
      router.replace("/sign-in");
    } else if (user && inAuthGroup) {
      router.replace("/");
    }
  }, [ready, user, segments, router]);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Create `mobile/app/sign-in.tsx`**

```tsx
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../lib/auth-context";
import { getGoogleClientId } from "../lib/config";

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const { signInWithGoogleIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uses the web client id as both webClientId and (for now) androidClientId.
  // Plan 4 adds a dedicated Android client id once EAS produces a SHA-1.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: getGoogleClientId(),
    androidClientId: getGoogleClientId(),
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      setBusy(true);
      setError(null);
      signInWithGoogleIdToken(idToken)
        .catch((e) => setError(e instanceof Error ? e.message : "Sign-in failed"))
        .finally(() => setBusy(false));
    }
  }, [response, signInWithGoogleIdToken]);

  return (
    <View className="flex-1 items-center justify-center bg-white gap-4 p-6">
      <Text className="text-2xl font-semibold">Payment Tracker</Text>
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Pressable
          disabled={!request}
          onPress={() => promptAsync()}
          className="bg-brand px-6 py-3 rounded-lg"
        >
          <Text className="text-brand-fg font-medium">Google ile giriş yap</Text>
        </Pressable>
      )}
      {error ? <Text className="text-red-600">{error}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 4: Verify it types and bundles**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd .. && git add mobile
git commit -m "feat(mobile): add sign-in screen and auth gate"
```

---

## Task 9: Bottom tabs and Payments home screen

The signed-in shell: a bottom-tab navigator (Payments now; Economy/Reports/Settings are Plan 3) and a Payments screen that fetches the user's payments through the authenticated API client and lists them. Proves the full loop: sign-in → token → authenticated fetch → render.

**Files:**
- Modify: `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Replace `mobile/app/(tabs)/_layout.tsx` with a minimal bottom-tab layout**

```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Ödemeler" }} />
    </Tabs>
  );
}
```

(Only the Payments tab for now. Plan 3 adds `economy`, `reports`, `settings` screens as sibling files.)

- [ ] **Step 2: Replace `mobile/app/(tabs)/index.tsx` with the Payments list**

```tsx
import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { useAuth } from "../../lib/auth-context";
import type { Payment } from "@shared/types";

export default function Payments() {
  const { api, signOut } = useAuth();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Payment[]>("/api/payments?filter=all");
      setPayments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (payments === null && !error) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {error ? (
        <View className="p-4 bg-red-50">
          <Text className="text-red-700">{error}</Text>
          <Pressable onPress={load} className="mt-2">
            <Text className="text-brand">Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={payments ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="p-4 gap-3"
        ListEmptyComponent={
          error ? null : <Text className="text-center text-gray-500">Ödeme yok</Text>
        }
        renderItem={({ item }) => (
          <View className="border border-gray-200 rounded-lg p-4">
            <Text className="font-semibold">{item.name}</Text>
            <Text className="text-gray-600">
              {item.amount} {item.currency}
            </Text>
          </View>
        )}
      />
      <Pressable onPress={signOut} className="p-4">
        <Text className="text-center text-gray-500">Çıkış yap</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Verify it types and bundles**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: `tsc` PASS; all mobile unit tests PASS (config, api, auth).

- [ ] **Step 4: Verify the whole mobile bundle builds (no runtime import errors)**

Run: `cd mobile && npx expo export --platform android --output-dir /tmp/expo-export-check`
Expected: export completes without bundling errors (proves every screen/module resolves, including `@shared/types` through Metro). Then remove the artifact: `rm -rf /tmp/expo-export-check`.

- [ ] **Step 5: Verify root tooling is still unaffected**

Run from repo root: `npx tsc --noEmit && npm test`
Expected: root `tsc` and Vitest still PASS (mobile changes never touched the Next.js build).

- [ ] **Step 6: Commit**

```bash
cd .. && git add mobile
git commit -m "feat(mobile): add bottom tabs and Payments home screen"
```

---

## Final verification (after all tasks)

- [ ] Mobile unit tests: `cd mobile && npm test` → all PASS (config, api, auth).
- [ ] Mobile types: `cd mobile && npx tsc --noEmit` → PASS.
- [ ] Mobile bundle: `cd mobile && npx expo export --platform android --output-dir /tmp/expo-export-check` → completes; then `rm -rf /tmp/expo-export-check`.
- [ ] Root untouched: from repo root `npx tsc --noEmit && npm test` → PASS.
- [ ] Manual (deferred to Plan 4 dev build, not gating): with `mobile/.env` filled, `npx expo start` boots to the sign-in screen; after Plan 4's dev build, Google sign-in completes and the Payments list loads.

## What this plan deliberately leaves to later plans

- **Plan 3:** Full feature parity — monthly-occurrence computation (reuse `shared/` pure logic), calendar view, payment add/edit forms, overrides, economy/assets, reports, teams/invites, i18n (move dictionaries to `shared/`), currency.
- **Plan 4:** EAS dev build + APK, real native Google sign-in verification, push registration on device (`expo-notifications` → `POST /api/devices`), deep links (`paymenttracker://month/...`), and the Android "remaining this month" widget.
