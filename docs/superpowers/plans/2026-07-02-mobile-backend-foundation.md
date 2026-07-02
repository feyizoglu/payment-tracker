# Mobil Backend Temeli — Implementation Plan (Plan 1/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut Next.js API'sini mobil (Expo) istemciye hazır hale getirmek: Bearer JWT auth, Google ID token girişi, cihaz push token kaydı ve cron'dan Expo push gönderimi.

**Architecture:** Tüm API route'lardaki NextAuth cookie kontrolü, hem Bearer JWT hem cookie kabul eden tek bir `getSessionUser` yardımcısına taşınır. Yeni `/api/auth/mobile` endpoint'i Google ID token'ı doğrulayıp 30 günlük uygulama JWT'si üretir. Yeni `devices` tablosu + `/api/devices` endpoint'i Expo push token'larını saklar; mevcut hatırlatma cron'u e-postaya ek push gönderir.

**Tech Stack:** Next.js 16 route handlers, `jose` (JWT imza/doğrulama — next-auth'un zaten getirdiği paket), Supabase, Expo Push HTTP API, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-android-mobile-app-design.md`

**Spec'ten bilinçli sapma:** Push metinleri şimdilik sabit Türkçe (mevcut e-postalarla tutarlı). Kullanıcı dil tercihi sunucuda tutulmuyor (yalnızca client state); kullanıcı-başına TR/EN push, Plan 3'te ayarlar ekranıyla birlikte `users.language` kolonu eklenince yapılacak.

**Kullanıcıdan manuel adımlar (plan sonunda hatırlat):**
1. Supabase SQL editöründe `devices` tablosu SQL'ini çalıştırmak (Task 7).
2. Google Cloud Console'da Android OAuth client oluşturup Vercel'e `GOOGLE_MOBILE_CLIENT_IDS` env'ini eklemek (Plan 2'de lazım olacak; şimdi eklenmezse `/api/auth/mobile` yalnızca web client ID'sini kabul eder).

---

### Task 1: Paylaşılan tipler — `shared/types.ts`

`src/types/index.ts` içeriği `shared/types.ts`'e taşınır; eski dosya re-export yapar. Böylece mevcut tüm `@/types` importları çalışmaya devam eder, Plan 2'de mobil taraf `shared/`'dan import eder.

**Files:**
- Create: `shared/types.ts`
- Modify: `src/types/index.ts` (içerik → tek satır re-export)

- [ ] **Step 1: `shared/types.ts` oluştur**

`src/types/index.ts`'in MEVCUT içeriğinin TAMAMINI (User, Team, TeamMember, Payment, CurrencyAmount, PaymentOverride, PaymentInstallment, RecurringPayment, RecurringEntry, Occurrence, GoldType, FiatCurrency, Currency, Asset, ExchangeRates — dosyanın o anki halini kopyala, burada özetlenmiş liste değil dosyanın kendisi esastır) `shared/types.ts`'e kopyala.

```bash
mkdir -p shared && cp src/types/index.ts shared/types.ts
```

- [ ] **Step 2: `src/types/index.ts`'i re-export'a çevir**

Dosyanın tüm içeriğini şununla değiştir:

```ts
export * from "../../shared/types";
```

- [ ] **Step 3: Doğrula**

```bash
npx tsc --noEmit && npm test
```

Expected: tsc hatasız; mevcut testler (payments.test.ts) PASS. (`tsconfig.json` `include: ["**/*.ts", ...]` olduğu için `shared/` zaten kapsanıyor.)

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts src/types/index.ts
git commit -m "refactor: move domain types to shared/ for upcoming mobile app"
```

---

### Task 2: `jose`'yi doğrudan bağımlılık yap

`jose` şu an next-auth'un transitive bağımlılığı olarak `node_modules`'ta mevcut. Doğrudan import edeceğimiz için `package.json`'a eklenmeli (yeni paket inmez, sadece kayıt altına alınır).

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Yükle**

```bash
npm install jose
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jose as direct dependency for mobile JWT auth"
```

---

### Task 3: Uygulama JWT'si — `src/lib/mobile-auth.ts` (sign/verify)

**Files:**
- Create: `src/lib/mobile-auth.ts`
- Test: `src/lib/mobile-auth.test.ts`

- [ ] **Step 1: Failing testleri yaz**

`src/lib/mobile-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signAppToken, verifyAppToken } from "./mobile-auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-32-chars-long!!";
});

describe("app token", () => {
  it("signs and verifies a round-trip token", async () => {
    const token = await signAppToken({ userId: "user-123", email: "a@b.com" });
    const payload = await verifyAppToken(token);
    expect(payload).toEqual({ userId: "user-123", email: "a@b.com" });
  });

  it("rejects a tampered token", async () => {
    const token = await signAppToken({ userId: "user-123", email: "a@b.com" });
    const tampered = token.slice(0, -2) + "xx";
    expect(await verifyAppToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifyAppToken("not-a-jwt")).toBeNull();
  });
});
```

- [ ] **Step 2: Testin FAIL ettiğini doğrula**

```bash
npm test -- src/lib/mobile-auth.test.ts
```

Expected: FAIL — `Cannot find module './mobile-auth'` (veya eşdeğeri).

- [ ] **Step 3: Implementasyonu yaz**

`src/lib/mobile-auth.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

const APP_TOKEN_ISSUER = "payment-tracker-mobile";
const APP_TOKEN_TTL = "30d";

// AUTH_SECRET modül yüklenirken değil, çağrı anında okunur (test setup'ı için önemli).
const secretKey = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export interface AppTokenPayload {
  userId: string;
  email: string;
}

export async function signAppToken(p: AppTokenPayload): Promise<string> {
  return new SignJWT({ email: p.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.userId)
    .setIssuedAt()
    .setIssuer(APP_TOKEN_ISSUER)
    .setExpirationTime(APP_TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyAppToken(token: string): Promise<AppTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: APP_TOKEN_ISSUER,
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Testlerin PASS ettiğini doğrula**

```bash
npm test -- src/lib/mobile-auth.test.ts
```

Expected: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobile-auth.ts src/lib/mobile-auth.test.ts
git commit -m "feat: app JWT sign/verify helpers for mobile auth"
```

---

### Task 4: Google ID token doğrulama — `mobile-auth.ts`'e ekle

Google'ın JWKS'iyle ID token doğrulanır. Uzak JWKS gerektirdiği için birim test yalnızca geçersiz girdinin reddini kapsar; gerçek token akışı Plan 2'de uçtan uca doğrulanacak.

**Files:**
- Modify: `src/lib/mobile-auth.ts`
- Test: `src/lib/mobile-auth.test.ts` (test ekle)

- [ ] **Step 1: Failing test ekle**

`src/lib/mobile-auth.test.ts`'e ekle:

```ts
import { verifyGoogleIdToken } from "./mobile-auth";

describe("verifyGoogleIdToken", () => {
  it("rejects malformed input without throwing", async () => {
    expect(await verifyGoogleIdToken("not-a-jwt")).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL doğrula**

```bash
npm test -- src/lib/mobile-auth.test.ts
```

Expected: FAIL — `verifyGoogleIdToken` export edilmemiş.

- [ ] **Step 3: Implementasyon ekle**

`src/lib/mobile-auth.ts`'e ekle:

```ts
import { createRemoteJWKSet } from "jose"; // mevcut jose import satırına ekle

const googleJWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

export interface GoogleProfile {
  email: string;
  name: string | null;
  picture: string | null;
}

// Kabul edilen client ID'ler: web (AUTH_GOOGLE_ID) + mobil (GOOGLE_MOBILE_CLIENT_IDS, virgülle ayrık).
const allowedGoogleAudiences = (): string[] =>
  [process.env.AUTH_GOOGLE_ID, ...(process.env.GOOGLE_MOBILE_CLIENT_IDS?.split(",") ?? [])]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile | null> {
  try {
    const { payload } = await jwtVerify(idToken, googleJWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: allowedGoogleAudiences(),
    });
    if (typeof payload.email !== "string") return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: PASS doğrula**

```bash
npm test -- src/lib/mobile-auth.test.ts
```

Expected: 4 test PASS ("not-a-jwt" JWKS fetch'e ulaşmadan format aşamasında reddedilir; test ağa çıkmaz).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobile-auth.ts src/lib/mobile-auth.test.ts
git commit -m "feat: Google ID token verification for mobile sign-in"
```

---

### Task 5: Ortak oturum yardımcısı — `src/lib/session.ts`

Önce `Authorization: Bearer` denenir; başlık varsa ama token geçersizse cookie'ye DÜŞÜLMEZ (401). Başlık yoksa NextAuth `auth()` kullanılır.

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

- [ ] **Step 1: Failing testleri yaz**

`src/lib/session.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { getSessionUser } from "./session";
import { signAppToken } from "./mobile-auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-32-chars-long!!";
});

const reqWith = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/test", { headers });

describe("getSessionUser", () => {
  it("returns user from a valid Bearer token", async () => {
    const token = await signAppToken({ userId: "u-1", email: "a@b.com" });
    const user = await getSessionUser(reqWith({ authorization: `Bearer ${token}` }));
    expect(user).toEqual({ id: "u-1", email: "a@b.com" });
  });

  it("returns null for an invalid Bearer token (no cookie fallback)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: "a@b.com", id: "u-1" },
    } as never);
    const user = await getSessionUser(reqWith({ authorization: "Bearer bogus" }));
    expect(user).toBeNull();
  });

  it("falls back to NextAuth session when no Bearer header", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: "a@b.com", id: "u-1" },
    } as never);
    const user = await getSessionUser(reqWith());
    expect(user).toEqual({ id: "u-1", email: "a@b.com" });
  });

  it("returns null when session lacks id or email", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com" } } as never);
    expect(await getSessionUser(reqWith())).toBeNull();
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await getSessionUser(reqWith())).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL doğrula**

```bash
npm test -- src/lib/session.test.ts
```

Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Implementasyonu yaz**

`src/lib/session.ts`:

```ts
import { auth } from "@/auth";
import { verifyAppToken } from "@/lib/mobile-auth";

export interface SessionUser {
  id: string;
  email: string;
}

// Web standard Request alır — NextRequest de Request'tir; testte sade Request kurulabilir.
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const payload = await verifyAppToken(header.slice("Bearer ".length));
    if (!payload) return null; // geçersiz token → cookie'ye düşme, düpedüz 401
    return { id: payload.userId, email: payload.email };
  }

  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user?.email || !id) return null;
  return { id, email: session.user.email };
}
```

- [ ] **Step 4: PASS doğrula**

```bash
npm test -- src/lib/session.test.ts
```

Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: getSessionUser helper accepting Bearer JWT or NextAuth cookie"
```

---

### Task 6: API route'ları `getSessionUser`'a geçir

11 route dosyası mekanik olarak dönüştürülür. `src/app/api/auth/[...nextauth]/route.ts`'e DOKUNULMAZ.

**Files (Modify):**
- `src/app/api/payments/route.ts`
- `src/app/api/payments/[id]/route.ts`
- `src/app/api/payments/[id]/override/route.ts`
- `src/app/api/recurring/route.ts`
- `src/app/api/recurring/[id]/route.ts`
- `src/app/api/recurring/[id]/entry/route.ts`
- `src/app/api/teams/route.ts`
- `src/app/api/teams/[id]/invite/route.ts`
- `src/app/api/assets/route.ts`
- `src/app/api/assets/[id]/route.ts`
- `src/app/api/users/me/route.ts`

- [ ] **Step 1: Dönüşüm kuralını her dosyaya uygula**

Her handler'da:

1. `import { auth } from "@/auth";` → `import { getSessionUser } from "@/lib/session";`
2. Şu blok:

```ts
const session = await auth();
if (!session?.user?.email) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

şununla değiştirilir:

```ts
const user = await getSessionUser(req);
if (!user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

3. `const userId = (session.user as any).id;` → `const userId = user.id;` — ve artık gereksiz kalan `if (!userId) { ...500... }` blokları silinir (getSessionUser id'siz kullanıcı döndürmez).
4. `session.user.email` kullanımları → `user.email`.
5. **Parametresiz handler'lara `req` ekle** — ör. `src/app/api/teams/route.ts:7`'deki `export async function GET()` → `export async function GET(req: NextRequest)` (ve dosyada `NextRequest` importu yoksa ekle). Dynamic route'larda ikinci parametre (`{ params }`) aynen korunur.

Kanonik örnek — `src/app/api/users/me/route.ts`'in tamamı şu hale gelir:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { color } = await req.json();
  const db = supabaseAdmin();

  const { error } = await db
    .from("users")
    .update({ color })
    .eq("email", user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `@/auth` importu API route'larda kalmadığını doğrula**

```bash
grep -rln 'from "@/auth"' src/app/api
```

Expected: yalnızca `src/app/api/auth/[...nextauth]/route.ts`.

- [ ] **Step 3: Derleme + test doğrula**

```bash
npx tsc --noEmit && npm test && npm run lint
```

Expected: hepsi temiz.

- [ ] **Step 4: Web'i elle duman testi yap**

```bash
npm run dev
```

Tarayıcıda giriş yap; dashboard'da ödemeler listelenir, bir ödeme ödendi işaretlenir, takımlar paneli açılır. (Cookie fallback yolunun bozulmadığının kanıtı — bu adım atlanamaz.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit -m "refactor: route auth through getSessionUser (Bearer + cookie)"
```

---

### Task 7: `devices` tablosu (SQL) + şema dosyası

**Files:**
- Modify: `supabase-schema.sql` (sona ekle)

- [ ] **Step 1: SQL'i şema dosyasına ekle**

`supabase-schema.sql` sonuna:

```sql
-- Mobile push notification device tokens
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Kullanıcıya manuel adımı bildir**

Bu SQL'i Supabase SQL editöründe çalıştırması gerekir (uygulama migration çalıştırmıyor; mevcut kurulumdaki yöntem bu). Task 8'in canlı testi bu adıma bağlıdır — kullanıcı onayı alınmadan Task 8'in Step 4'üne geçme.

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: devices table schema for expo push tokens"
```

---

### Task 8: `POST /api/devices` — push token kaydı

**Files:**
- Create: `src/app/api/devices/route.ts`

- [ ] **Step 1: Route'u yaz**

`src/app/api/devices/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token = body?.expo_push_token;
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken")) {
    return NextResponse.json({ error: "expo_push_token required" }, { status: 400 });
  }
  const platform = body?.platform === "ios" ? "ios" : "android";

  const db = supabaseAdmin();
  const { error } = await db.from("devices").upsert(
    {
      user_id: user.id,
      expo_push_token: token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Derleme doğrula**

```bash
npx tsc --noEmit
```

Expected: temiz.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/devices/route.ts
git commit -m "feat: device registration endpoint for expo push tokens"
```

- [ ] **Step 4: Canlı doğrulama (devices tablosu Supabase'de oluşturulduktan sonra)**

```bash
# Geçerli bir app JWT üret (dev ortam AUTH_SECRET'ıyla):
TOKEN=$(node --input-type=module -e "
import { SignJWT } from 'jose';
const t = await new SignJWT({ email: 'TEST_EMAIL' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('TEST_USER_UUID')
  .setIssuedAt().setIssuer('payment-tracker-mobile').setExpirationTime('1h')
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
console.log(t);
")
curl -s -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"expo_push_token":"ExponentPushToken[test123]","platform":"android"}'
```

(`TEST_USER_UUID` = users tablosundaki gerçek bir id, `TEST_EMAIL` = onun e-postası; AUTH_SECRET'ı `.env.local`'dan yükleyerek çalıştır.) Expected: `{"ok":true}` ve Supabase'de satır. Bu aynı zamanda Bearer yolunun uçtan uca ilk kanıtıdır.

---

### Task 9: `POST /api/auth/mobile` — Google girişi → app JWT

**Files:**
- Create: `src/app/api/auth/mobile/route.ts`

- [ ] **Step 1: Route'u yaz**

`src/app/api/auth/mobile/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyGoogleIdToken, signAppToken } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const idToken = body?.id_token;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "id_token required" }, { status: 400 });
  }

  const profile = await verifyGoogleIdToken(idToken);
  if (!profile) {
    return NextResponse.json({ error: "Invalid Google ID token" }, { status: 401 });
  }

  // Web'deki NextAuth signIn callback'iyle aynı upsert (src/auth.ts ile tutarlı kalmalı)
  const db = supabaseAdmin();
  const { data: userRow, error } = await db
    .from("users")
    .upsert(
      {
        email: profile.email,
        name: profile.name,
        avatar_url: profile.picture,
      },
      { onConflict: "email" }
    )
    .select("id, email, name, avatar_url")
    .single();

  if (error || !userRow) {
    return NextResponse.json(
      { error: error?.message ?? "User upsert failed" },
      { status: 500 }
    );
  }

  const token = await signAppToken({ userId: userRow.id, email: userRow.email });
  return NextResponse.json({ token, user: userRow });
}
```

- [ ] **Step 2: Derleme + negatif yol doğrula**

```bash
npx tsc --noEmit && npm run dev &
sleep 5
curl -s -X POST http://localhost:3000/api/auth/mobile -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:3000/api/auth/mobile -H "Content-Type: application/json" -d '{"id_token":"bogus"}'
```

Expected: sırasıyla `{"error":"id_token required"}` (400) ve `{"error":"Invalid Google ID token"}` (401). Pozitif yol (gerçek Google token) Plan 2'de mobil istemciyle doğrulanacak — bunu plan çıktısında "inferred, not e2e-verified" olarak işaretle.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/mobile/route.ts
git commit -m "feat: mobile sign-in endpoint exchanging Google ID token for app JWT"
```

---

### Task 10: Expo push gönderici — `src/lib/push.ts`

**Files:**
- Create: `src/lib/push.ts`
- Test: `src/lib/push.test.ts`

- [ ] **Step 1: Failing testleri yaz**

`src/lib/push.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendExpoPush } from "./push";

afterEach(() => vi.unstubAllGlobals());

const okTicket = { status: "ok", id: "t1" };
const deadTicket = {
  status: "error",
  message: "device gone",
  details: { error: "DeviceNotRegistered" },
};

describe("sendExpoPush", () => {
  it("returns zero result for empty input without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendExpoPush([]);
    expect(res).toEqual({ sent: 0, invalidTokens: [], errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts ok tickets and collects DeviceNotRegistered tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [okTicket, deadTicket] }), { status: 200 })
      )
    );
    const res = await sendExpoPush([
      { to: "ExponentPushToken[a]", title: "t", body: "b" },
      { to: "ExponentPushToken[b]", title: "t", body: "b" },
    ]);
    expect(res.sent).toBe(1);
    expect(res.invalidTokens).toEqual(["ExponentPushToken[b]"]);
    expect(res.errors).toEqual(["device gone"]);
  });

  it("records HTTP failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("oops", { status: 500 }))
    );
    const res = await sendExpoPush([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
    expect(res.sent).toBe(0);
    expect(res.errors).toEqual(["HTTP 500"]);
  });
});
```

- [ ] **Step 2: FAIL doğrula**

```bash
npm test -- src/lib/push.test.ts
```

Expected: FAIL — `Cannot find module './push'`.

- [ ] **Step 3: Implementasyonu yaz**

`src/lib/push.ts`:

```ts
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: number;
  invalidTokens: string[];
  errors: string[];
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo push API istek başına 100 mesaj kabul eder

export async function sendExpoPush(messages: PushMessage[]): Promise<PushResult> {
  const result: PushResult = { sent: 0, invalidTokens: [], errors: [] };

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : "network error");
      continue;
    }
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status}`);
      continue;
    }
    const json = await res.json().catch(() => null);
    const tickets: Array<{
      status: string;
      message?: string;
      details?: { error?: string };
    }> = json?.data ?? [];
    tickets.forEach((ticket, idx) => {
      if (ticket.status === "ok") {
        result.sent += 1;
        return;
      }
      if (ticket.details?.error === "DeviceNotRegistered") {
        result.invalidTokens.push(chunk[idx].to);
      }
      result.errors.push(ticket.message ?? "unknown push error");
    });
  }

  return result;
}
```

- [ ] **Step 4: PASS doğrula**

```bash
npm test -- src/lib/push.test.ts
```

Expected: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push.ts src/lib/push.test.ts
git commit -m "feat: expo push sender with dead-token detection"
```

---

### Task 11: Cron'a push entegrasyonu

Mevcut `dueByUser` haritası kurulduktan sonra (recurring döngüsünün bitişi, `src/app/api/cron/send-reminders/route.ts:92` civarı) push gönderimi eklenir. E-posta akışı değişmez.

**Files:**
- Modify: `src/app/api/cron/send-reminders/route.ts`

- [ ] **Step 1: Push bloğunu ekle**

Import'lara ekle:

```ts
import { sendExpoPush, type PushMessage } from "@/lib/push";
```

Recurring döngüsünün bitiminden sonra, e-posta gönderim döngüsünden önce ekle:

```ts
// Push notifications to registered devices (in addition to email)
let pushSummary = { sent: 0, invalidTokens: [] as string[], errors: [] as string[] };
const dueUserIds = [...dueByUser.keys()];
if (dueUserIds.length > 0) {
  const { data: devices } = await db
    .from("devices")
    .select("user_id, expo_push_token")
    .in("user_id", dueUserIds);

  const tomorrowStr2 = format(tomorrow, "dd MMMM yyyy");
  const messages: PushMessage[] = [];
  for (const device of devices ?? []) {
    const due = dueByUser.get(device.user_id);
    if (!due) continue;
    const lines = due.items.map((item) => {
      const tutar =
        item.amount == null
          ? ""
          : ` — ${getCurrencySymbol(item.currency)}${new Intl.NumberFormat("tr-TR", {
              minimumFractionDigits: 2,
            }).format(item.amount)}`;
      return `${item.paymentName}${tutar}`;
    });
    messages.push({
      to: device.expo_push_token,
      title: "Ödeme Hatırlatıcısı",
      body: `Yarın (${tomorrowStr2}) vadesi dolan: ${lines.join(", ")}`,
      data: { month: format(tomorrow, "yyyy-MM") }, // Plan 4: deep link paymenttracker://month/<yyyy-MM>
    });
  }

  pushSummary = await sendExpoPush(messages);
  if (pushSummary.invalidTokens.length > 0) {
    await db.from("devices").delete().in("expo_push_token", pushSummary.invalidTokens);
  }
}
```

Response JSON'una push özetini ekle — mevcut `return NextResponse.json({ date, sent, results })` şu hale gelir:

```ts
return NextResponse.json({
  date: format(tomorrow, "yyyy-MM-dd"),
  sent: results.length,
  results,
  push: pushSummary,
});
```

- [ ] **Step 2: Derleme + test doğrula**

```bash
npx tsc --noEmit && npm test
```

Expected: temiz.

- [ ] **Step 3: Canlı doğrula (dev)**

```bash
curl -s http://localhost:3000/api/cron/send-reminders -H "Authorization: Bearer $CRON_SECRET"
```

(`CRON_SECRET` `.env.local`'dan.) Expected: JSON içinde `push` alanı; devices tablosunda sahte token varsa `errors`/`invalidTokens` dolar ve sahte token satırı silinir — bu ölü-token temizliğinin canlı kanıtıdır. Gerçek cihaza push, Plan 2'de cihaz kaydolunca doğrulanır.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/send-reminders/route.ts
git commit -m "feat: send expo push reminders alongside email in cron"
```

---

### Task 12: Kapanış — env dokümantasyonu ve tam doğrulama

**Files:**
- Modify: `README.md` (env bölümü yoksa kısa bölüm ekle)

- [ ] **Step 1: README'ye env notu ekle**

`README.md` sonuna:

```markdown
## Mobile API environment variables

- `GOOGLE_MOBILE_CLIENT_IDS` — comma-separated Google OAuth client IDs accepted by
  `POST /api/auth/mobile` in addition to `AUTH_GOOGLE_ID` (add the Android client ID
  here when the mobile app's OAuth client is created). Optional until the mobile app ships.
```

- [ ] **Step 2: Tam doğrulama**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Expected: hepsi temiz.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document mobile auth env vars"
```

- [ ] **Step 4: Kullanıcıya manuel adımları hatırlat**

1. Supabase'de `devices` SQL'i çalıştırıldı mı? (Task 7)
2. Vercel'e deploy + `GOOGLE_MOBILE_CLIENT_IDS` (Android OAuth client oluşunca).
3. Plan 2 (Expo iskeleti + auth + ana ekran) yazılmaya hazır.
