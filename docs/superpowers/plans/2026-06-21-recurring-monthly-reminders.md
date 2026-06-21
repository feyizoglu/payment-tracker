# Aylık Tekrar Eden Ödeme Hatırlatıcıları — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının taksit mantığından bağımsız, her ayın belirli bir gününde tekrar eden (örn. kredi kartı) bir ödeme hatırlatıcısı oluşturmasına, her ayın tutarını sonradan tek tek girip değiştirmesine olanak tanımak.

**Architecture:** İki yeni tablo — `recurring_payments` (şablon) ve `recurring_entries` (her ay için tutar/ödendi). `lib/payments.ts`'e taksit + tekrar edenleri tek bir `Occurrence` tipine indiren saf bir katman eklenir; takvim, PayUntil, dashboard toplamları ve e-posta cron'u bu birleşik tipi tüketir. Mevcut taksit akışına dokunulmaz.

**Tech Stack:** Next.js 16 (App Router, `force-dynamic` route handler'lar), React 19, TypeScript, Supabase (service-role admin client), date-fns, Tailwind, vitest (yeni — saf fonksiyon testleri).

**Spec:** `docs/superpowers/specs/2026-06-21-recurring-monthly-reminders-design.md`

> ⚠️ **Next.js notu (AGENTS.md):** Bu Next sürümü kırıcı değişiklikler içerebilir. Route handler ve dinamik segment (`[id]`) konvansiyonlarını yazmadan önce `node_modules/next/dist/docs/01-app` altındaki ilgili rehberi kontrol et. Mevcut route'lar `{ params }: { params: Promise<{ id: string }> }` + `const { id } = await params` desenini kullanıyor; aynısını izle.

---

### Task 1: Veritabanı şeması

**Files:**
- Modify: `supabase-schema.sql` (assets tablosundan sonra, "Enable Row Level Security" bloğundan önce ekle)

- [ ] **Step 1: İki yeni tabloyu ekle**

`supabase-schema.sql` içinde `-- Enable Row Level Security` satırından **hemen önce** şunu ekle:

```sql
-- Recurring payments (monthly reminders, separate from installment payments)
create table if not exists recurring_payments (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade not null,
  name text not null,
  currency text not null default 'TRY',
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month date not null,
  end_month date,
  created_at timestamptz default now()
);

-- Per-month amount/paid state for a recurring payment
create table if not exists recurring_entries (
  id uuid default gen_random_uuid() primary key,
  recurring_id uuid references recurring_payments(id) on delete cascade not null,
  period date not null,
  amount numeric(12,2),
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique (recurring_id, period)
);
```

- [ ] **Step 2: RLS'i etkinleştir ve politikaları ekle**

`supabase-schema.sql` içinde `alter table assets enable row level security;` satırından sonra ekle:

```sql
alter table recurring_payments enable row level security;
alter table recurring_entries enable row level security;
```

Dosyanın sonuna (assets policy'lerinden sonra) ekle:

```sql
-- Recurring payments policies (service role bypasses; mirror payments)
create policy "Members can view recurring payments"
  on recurring_payments for select using (true);
create policy "Users can insert recurring payments"
  on recurring_payments for insert with check (true);
create policy "Users can update recurring payments"
  on recurring_payments for update using (true);
create policy "Users can delete recurring payments"
  on recurring_payments for delete using (true);

create policy "Members can view recurring entries"
  on recurring_entries for select using (true);
create policy "Users can insert recurring entries"
  on recurring_entries for insert with check (true);
create policy "Users can update recurring entries"
  on recurring_entries for update using (true);
create policy "Users can delete recurring entries"
  on recurring_entries for delete using (true);
```

- [ ] **Step 3: Migration'ı Supabase'de çalıştır (manuel doğrulama)**

Supabase SQL Editor'de güncellenmiş `supabase-schema.sql`'i çalıştır (tüm ifadeler `if not exists` ile idempotent). Doğrula: `recurring_payments` ve `recurring_entries` tabloları Table Editor'de görünüyor.

> Not: Politika oluşturma idempotent değildir; tekrar çalıştırırsan önce `drop policy if exists ...` gerekebilir. İlk kurulumda sorun yok.

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(db): add recurring_payments and recurring_entries tables"
```

---

### Task 2: Tipler

**Files:**
- Modify: `src/types/index.ts` (Payment/PaymentInstallment'tan sonra)

- [ ] **Step 1: Yeni tipleri ekle**

`src/types/index.ts` içinde `PaymentInstallment` interface'inden sonra ekle:

```ts
export interface RecurringPayment {
  id: string;
  team_id: string | null;
  user_id: string;
  name: string;
  currency: string;
  day_of_month: number;
  start_month: string;       // 'yyyy-MM-01'
  end_month: string | null;  // 'yyyy-MM-01' | null
  created_at: string;
  entries?: RecurringEntry[];
  user?: User;
}

export interface RecurringEntry {
  id: string;
  recurring_id: string;
  period: string;            // 'yyyy-MM-01'
  amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export interface Occurrence {
  kind: "installment" | "recurring";
  sourceId: string;
  name: string;
  currency: string;
  user_id: string;
  team_id: string | null;
  dueDate: Date;
  amount: number | null;
  isPaid: boolean;
  installmentIndex?: number;
  totalInstallments?: number;
  period?: string;
  entryId?: string | null;
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok (yeni tipler henüz kullanılmıyor).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add RecurringPayment, RecurringEntry, Occurrence"
```

---

### Task 3: Vitest kurulumu

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `vitest.config.ts`
- Create: `src/lib/smoke.test.ts` (geçici doğrulama testi)

- [ ] **Step 1: vitest'i kur**

Run: `npm install -D vitest`
Expected: `package.json` devDependencies'e `vitest` eklenir, hata yok.

- [ ] **Step 2: Test script'lerini ekle**

`package.json` `scripts` bloğunu şu hale getir (mevcut satırları koru, iki yeni satır ekle):

```json
  "scripts": {
    "dev": "NODE_TLS_REJECT_UNAUTHORIZED=0 next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: vitest.config.ts oluştur**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Smoke testi yaz**

`src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Testi çalıştır**

Run: `npm test`
Expected: PASS (1 passed).

- [ ] **Step 6: Smoke testini sil ve commit**

```bash
rm src/lib/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit testing pure functions"
```

---

### Task 4: Occurrence katmanı (`lib/payments.ts`) — TDD

**Files:**
- Modify: `src/lib/payments.ts` (yeni saf fonksiyonlar; mevcutlara dokunma)
- Test: `src/lib/payments.test.ts`

- [ ] **Step 1: Başarısız testleri yaz**

`src/lib/payments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  recurringOccurrenceForMonth,
  getOccurrencesForMonth,
  getOccurrencesInRange,
} from "@/lib/payments";
import { Payment, RecurringPayment } from "@/types";

function makeRecurring(over: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: "r1",
    team_id: null,
    user_id: "u1",
    name: "Kredi Kartı",
    currency: "TRY",
    day_of_month: 15,
    start_month: "2026-06-01",
    end_month: null,
    created_at: "2026-06-01T00:00:00Z",
    entries: [],
    ...over,
  };
}

function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    team_id: null,
    user_id: "u1",
    name: "Laptop",
    amount: 1200,
    currency: "TRY",
    start_date: "2026-06-10",
    day_of_month: 10,
    total_installments: 12,
    paid_installments: 0,
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("recurringOccurrenceForMonth", () => {
  it("returns null before the start month", () => {
    const r = makeRecurring({ start_month: "2026-06-01" });
    expect(recurringOccurrenceForMonth(r, 2026, 4)).toBeNull(); // May
  });

  it("returns an occurrence within the active range", () => {
    const r = makeRecurring();
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July (0-indexed 6)
    expect(occ).not.toBeNull();
    expect(occ!.kind).toBe("recurring");
    expect(occ!.dueDate.getFullYear()).toBe(2026);
    expect(occ!.dueDate.getMonth()).toBe(6);
    expect(occ!.dueDate.getDate()).toBe(15);
    expect(occ!.amount).toBeNull();
    expect(occ!.isPaid).toBe(false);
  });

  it("clamps day_of_month to the last day of short months", () => {
    const r = makeRecurring({ day_of_month: 31, start_month: "2026-01-01" });
    const occ = recurringOccurrenceForMonth(r, 2026, 1); // Feb 2026 -> 28
    expect(occ!.dueDate.getDate()).toBe(28);
  });

  it("includes the end month (inclusive) but not after", () => {
    const r = makeRecurring({ start_month: "2026-06-01", end_month: "2026-08-01" });
    expect(recurringOccurrenceForMonth(r, 2026, 7)).not.toBeNull(); // Aug
    expect(recurringOccurrenceForMonth(r, 2026, 8)).toBeNull();     // Sep
  });

  it("reads amount and isPaid from the matching entry", () => {
    const r = makeRecurring({
      entries: [
        { id: "e1", recurring_id: "r1", period: "2026-07-01", amount: 5000, is_paid: true, paid_at: null, created_at: "" },
      ],
    });
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July
    expect(occ!.amount).toBe(5000);
    expect(occ!.isPaid).toBe(true);
    expect(occ!.entryId).toBe("e1");
    expect(occ!.period).toBe("2026-07-01");
  });
});

describe("getOccurrencesForMonth", () => {
  it("merges installment and recurring occurrences sorted by day", () => {
    const payment = makePayment({ start_date: "2026-07-20", day_of_month: 20 });
    const r = makeRecurring({ day_of_month: 5, start_month: "2026-06-01" });
    const occ = getOccurrencesForMonth([payment], [r], 2026, 6); // July
    expect(occ.map((o) => o.dueDate.getDate())).toEqual([5, 20]);
    expect(occ[0].kind).toBe("recurring");
    expect(occ[1].kind).toBe("installment");
  });
});

describe("getOccurrencesInRange", () => {
  it("includes recurring occurrences whose due date falls in range", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01" });
    const start = new Date(2026, 6, 1);  // 1 Jul
    const end = new Date(2026, 7, 31);   // 31 Aug
    const occ = getOccurrencesInRange([], [r], start, end);
    expect(occ.length).toBe(2); // Jul 15 + Aug 15
    expect(occ[0].dueDate.getMonth()).toBe(6);
    expect(occ[1].dueDate.getMonth()).toBe(7);
  });

  it("excludes occurrences outside the range boundaries", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01" });
    const start = new Date(2026, 6, 16); // 16 Jul (after the 15th)
    const end = new Date(2026, 6, 31);   // 31 Jul
    const occ = getOccurrencesInRange([], [r], start, end);
    expect(occ.length).toBe(0);
  });
});
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını doğrula**

Run: `npm test`
Expected: FAIL — `recurringOccurrenceForMonth is not a function` / import hatası.

- [ ] **Step 3: Fonksiyonları implemente et**

`src/lib/payments.ts` en üstteki import'u güncelle:

```ts
import { Payment, PaymentInstallment, RecurringPayment, Occurrence } from "@/types";
```

Dosyanın **sonuna** ekle:

```ts
// ── Recurring / unified occurrence layer ────────────────────────────────────

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function clampDay(year: number, month: number, day: number): number {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, maxDay);
}

export function installmentOccurrences(payment: Payment): Occurrence[] {
  return getInstallments(payment).map((inst) => ({
    kind: "installment" as const,
    sourceId: payment.id,
    name: payment.name,
    currency: payment.currency ?? "TRY",
    user_id: payment.user_id,
    team_id: payment.team_id,
    dueDate: inst.dueDate,
    amount: inst.amount,
    isPaid: inst.isPaid,
    installmentIndex: inst.index,
    totalInstallments: payment.total_installments,
  }));
}

// Returns the occurrence for a recurring payment in the given month, or null if
// the payment is not active that month. month is 0-indexed.
export function recurringOccurrenceForMonth(
  r: RecurringPayment,
  year: number,
  month: number
): Occurrence | null {
  const start = parseLocalDate(r.start_month);
  const startY = start.getFullYear();
  const startM = start.getMonth();
  if (year < startY || (year === startY && month < startM)) return null;

  if (r.end_month) {
    const end = parseLocalDate(r.end_month);
    const endY = end.getFullYear();
    const endM = end.getMonth();
    if (year > endY || (year === endY && month > endM)) return null;
  }

  const day = clampDay(year, month, r.day_of_month);
  const dueDate = new Date(year, month, day);
  const period = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const entry = r.entries?.find((e) => e.period === period);

  return {
    kind: "recurring",
    sourceId: r.id,
    name: r.name,
    currency: r.currency ?? "TRY",
    user_id: r.user_id,
    team_id: r.team_id,
    dueDate,
    amount: entry?.amount ?? null,
    isPaid: entry?.is_paid ?? false,
    period,
    entryId: entry?.id ?? null,
  };
}

export function getOccurrencesForMonth(
  payments: Payment[],
  recurrings: RecurringPayment[],
  year: number,
  month: number
): Occurrence[] {
  const result: Occurrence[] = [];

  for (const p of payments) {
    for (const occ of installmentOccurrences(p)) {
      if (occ.dueDate.getFullYear() === year && occ.dueDate.getMonth() === month) {
        result.push(occ);
      }
    }
  }
  for (const r of recurrings) {
    const occ = recurringOccurrenceForMonth(r, year, month);
    if (occ) result.push(occ);
  }

  result.sort((a, b) => a.dueDate.getDate() - b.dueDate.getDate());
  return result;
}

export function getOccurrencesInRange(
  payments: Payment[],
  recurrings: RecurringPayment[],
  start: Date,
  end: Date
): Occurrence[] {
  const result: Occurrence[] = [];

  for (const p of payments) {
    for (const occ of installmentOccurrences(p)) {
      if (occ.dueDate >= start && occ.dueDate <= end) result.push(occ);
    }
  }

  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    for (const r of recurrings) {
      const occ = recurringOccurrenceForMonth(r, y, m);
      if (occ && occ.dueDate >= start && occ.dueDate <= end) result.push(occ);
    }
    m++;
    if (m > 11) { m = 0; y++; }
  }

  result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return result;
}
```

- [ ] **Step 4: Testleri çalıştır, geçtiklerini doğrula**

Run: `npm test`
Expected: PASS (tüm describe blokları yeşil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments.ts src/lib/payments.test.ts
git commit -m "feat(lib): add unified occurrence layer for recurring payments"
```

---

### Task 5: API — `GET`/`POST /api/recurring`

**Files:**
- Create: `src/app/api/recurring/route.ts`

> Yazmadan önce: `node_modules/next/dist/docs/01-app` altındaki Route Handlers rehberini kontrol et. Desen `src/app/api/payments/route.ts` ile aynı olmalı.

- [ ] **Step 1: Route handler'ı oluştur**

`src/app/api/recurring/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id");
  const filter = searchParams.get("filter");
  const userId = (session.user as any).id;

  const { data: memberRows } = await db
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const myTeamIds = (memberRows ?? []).map((r: any) => r.team_id);

  let query = db
    .from("recurring_payments")
    .select("*, entries:recurring_entries(*), added_by_user:users!recurring_payments_user_id_fkey(name, email, avatar_url)")
    .order("created_at", { ascending: true });

  if (teamId) {
    query = query.eq("team_id", teamId);
  } else if (filter === "personal") {
    query = query.eq("user_id", userId).is("team_id", null);
  } else if (filter && filter !== "all") {
    query = query.eq("team_id", filter);
  } else {
    if (myTeamIds.length > 0) {
      query = query.or(`user_id.eq.${userId},team_id.in.(${myTeamIds.join(",")})`);
    } else {
      query = query.eq("user_id", userId);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const userId = (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ error: "User not found in database. Please sign out and sign in again." }, { status: 500 });
  }

  const body = await req.json();

  let targetUserId = userId;
  if (body.target_user_id && body.target_user_id !== userId) {
    if (!body.team_id) {
      return NextResponse.json({ error: "team_id required when specifying target_user_id" }, { status: 400 });
    }
    const { data: membership } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", body.team_id)
      .eq("user_id", userId)
      .single();
    if (membership?.role !== "owner") {
      return NextResponse.json({ error: "Only team owners can add for other members" }, { status: 403 });
    }
    targetUserId = body.target_user_id;
  }

  // Derive day_of_month + start_month from the first payment date (yyyy-MM-dd)
  const [sy, sm, sd] = String(body.start_date).split("-").map(Number);
  const day_of_month = sd;
  const start_month = `${sy}-${String(sm).padStart(2, "0")}-01`;

  // end_month comes from a month input as 'yyyy-MM' (optional)
  let end_month: string | null = null;
  if (body.end_month) {
    const [ey, em] = String(body.end_month).split("-").map(Number);
    end_month = `${ey}-${String(em).padStart(2, "0")}-01`;
  }

  const { data, error } = await db
    .from("recurring_payments")
    .insert({
      user_id: targetUserId,
      team_id: body.team_id || null,
      name: body.name,
      currency: body.currency || "TRY",
      day_of_month,
      start_month,
      end_month,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Build kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recurring/route.ts
git commit -m "feat(api): add GET/POST /api/recurring"
```

---

### Task 6: API — `PATCH`/`DELETE /api/recurring/[id]`

**Files:**
- Create: `src/app/api/recurring/[id]/route.ts`

- [ ] **Step 1: Route handler'ı oluştur**

`src/app/api/recurring/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function canManage(db: ReturnType<typeof supabaseAdmin>, id: string, userId: string) {
  const { data: row } = await db
    .from("recurring_payments")
    .select("user_id, team_id")
    .eq("id", id)
    .single();
  if (!row) return false;
  if (row.user_id === userId) return true;
  if (row.team_id) {
    const { data: m } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", row.team_id)
      .eq("user_id", userId)
      .single();
    return m?.role === "owner";
  }
  return false;
}

function normalizeMonth(v: string): string {
  const [y, m] = v.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManage(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.day_of_month !== undefined) patch.day_of_month = body.day_of_month;
  if (body.end_month !== undefined) {
    patch.end_month = body.end_month ? normalizeMonth(String(body.end_month)) : null;
  }

  const { data, error } = await db
    .from("recurring_payments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManage(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await db.from("recurring_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Build kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/recurring/[id]/route.ts"
git commit -m "feat(api): add PATCH/DELETE /api/recurring/[id]"
```

---

### Task 7: API — `PUT /api/recurring/[id]/entry` (aylık upsert)

**Files:**
- Create: `src/app/api/recurring/[id]/entry/route.ts`

- [ ] **Step 1: Route handler'ı oluştur**

`src/app/api/recurring/[id]/entry/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function canManage(db: ReturnType<typeof supabaseAdmin>, id: string, userId: string) {
  const { data: row } = await db
    .from("recurring_payments")
    .select("user_id, team_id")
    .eq("id", id)
    .single();
  if (!row) return false;
  if (row.user_id === userId) return true;
  if (row.team_id) {
    const { data: m } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", row.team_id)
      .eq("user_id", userId)
      .single();
    return m?.role === "owner";
  }
  return false;
}

function normalizePeriod(v: string): string {
  const [y, m] = v.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params; // recurring_id
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManage(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json(); // { period, amount?, is_paid? }
  if (!body.period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }

  const payload: Record<string, any> = {
    recurring_id: id,
    period: normalizePeriod(String(body.period)),
  };
  if (body.amount !== undefined) {
    payload.amount = body.amount === null || body.amount === "" ? null : Number(body.amount);
  }
  if (body.is_paid !== undefined) {
    payload.is_paid = !!body.is_paid;
    payload.paid_at = body.is_paid ? new Date().toISOString() : null;
  }

  const { data, error } = await db
    .from("recurring_entries")
    .upsert(payload, { onConflict: "recurring_id,period" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

> Not: Supabase `.upsert()` yalnızca payload'daki kolonları `ON CONFLICT DO UPDATE SET col = excluded.col` olarak günceller. Yani sadece `amount` gönderince mevcut `is_paid` korunur ve tam tersi — bu istenen davranış.

- [ ] **Step 2: Build kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/recurring/[id]/entry/route.ts"
git commit -m "feat(api): add PUT /api/recurring/[id]/entry upsert"
```

---

### Task 8: i18n metinleri

**Files:**
- Modify: `src/lib/i18n.tsx` (hem `en` hem `tr` bloklarına)

- [ ] **Step 1: EN bloğuna anahtarları ekle**

`src/lib/i18n.tsx` içinde EN bloğundaki `payUntilEmpty` satırından sonra (kapanış `},`'dan önce) ekle:

```ts
    // Recurring payments
    paymentTypeLabel: "Payment Type",
    installmentType: "Installment",
    recurringType: "Monthly recurring",
    recurringAmountHint: "You'll enter each month's amount from the calendar.",
    endMonthOptional: "End month (optional)",
    enterAmount: "Enter amount",
    recurringBadge: "Monthly recurring",
    recurringDeleteConfirm: "This reminder and all its monthly entries will be deleted. Continue?",
    everyMonthDay: "Day {day} of every month",
    dayOfMonthLabel: "Day of month",
    noEndDate: "No end date",
    untilMonth: "Until",
```

- [ ] **Step 2: TR bloğuna anahtarları ekle**

`src/lib/i18n.tsx` içinde TR bloğundaki `payUntilEmpty` satırından sonra ekle:

```ts
    // Recurring payments
    paymentTypeLabel: "Ödeme Türü",
    installmentType: "Taksitli",
    recurringType: "Aylık tekrar eden",
    recurringAmountHint: "Tutarı her ay takvimden gireceksin.",
    endMonthOptional: "Bitiş ayı (opsiyonel)",
    enterAmount: "Tutar gir",
    recurringBadge: "Aylık tekrar eden",
    recurringDeleteConfirm: "Bu hatırlatıcı ve tüm aylarındaki kayıtlar silinecek. Devam edilsin mi?",
    everyMonthDay: "Her ayın {day}'i",
    dayOfMonthLabel: "Ayın günü",
    noEndDate: "Bitiş yok",
    untilMonth: "Bitiş",
```

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok (her iki blok aynı anahtar setine sahip olmalı).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat(i18n): add recurring payment strings (TR/EN)"
```

---

### Task 9: PaymentForm'a tür anahtarı (tekrar eden oluşturma)

**Files:**
- Modify: `src/components/PaymentForm.tsx`

- [ ] **Step 1: Durum (state) ekle**

`src/components/PaymentForm.tsx` içinde mevcut `const [inputMode, setInputMode] = useState<"total" | "installment">("total");` satırından sonra ekle:

```tsx
  const [entryKind, setEntryKind] = useState<"installment" | "recurring">("installment");
  const [endMonth, setEndMonth] = useState("");
```

- [ ] **Step 2: handleSubmit'i tür ayrımı yapacak şekilde güncelle**

`handleSubmit` içindeki `try { ... }` bloğunun başını şu hale getir (mevcut taksit POST'unu `else` dalına taşı):

```tsx
    try {
      if (entryKind === "recurring") {
        const res = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            currency: form.currency,
            start_date: form.start_date,
            end_month: endMonth || undefined,
            team_id: form.team_id || null,
            target_user_id: targetUserId || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add reminder");
        }
        onCreated();
        onClose();
        return;
      }

      const totalAmt = inputMode === "total"
        ? parseFloat(form.totalAmount)
        : (parseFloat(form.installmentAmount) * installmentCount);

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          amount: totalAmt,
          currency: form.currency,
          start_date: form.start_date,
          total_installments: installmentCount,
          team_id: form.team_id || null,
          target_user_id: targetUserId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add payment");
      }

      onCreated();
      onClose();
    } catch (err: any) {
```

- [ ] **Step 3: Tür anahtarını forma ekle (en üste, Name alanından önce)**

`<form onSubmit={handleSubmit} ...>` açılışından hemen sonra, `{/* Name */}` bloğundan **önce** ekle:

```tsx
          {/* Entry kind toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t.paymentTypeLabel}</label>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(["installment", "recurring"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setEntryKind(kind)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
                    entryKind === kind ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {kind === "installment" ? t.installmentType : t.recurringType}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 4: Taksit-özel alanları koşullu yap**

Taksit moduna özel iki bloğu (Input mode toggle + Amount field) ve "Installments count" bloğunu yalnızca taksitte göster. Üç bloğun her birini `{entryKind === "installment" && ( ... )}` ile sar. Örneğin "Input mode toggle" bloğunu:

```tsx
          {entryKind === "installment" && (
          <>
          {/* Input mode toggle */}
          <div>
            ...mevcut içerik...
          </div>

          {/* Amount field */}
          <div>
            ...mevcut içerik...
          </div>

          {/* Installments count */}
          <div>
            ...mevcut içerik...
          </div>
          </>
          )}
```

(Üç bloğu tek bir `{entryKind === "installment" && (<> ... </>)}` sarmalayıcısı içine al. Currency seçimi Amount field içinde olduğu için tekrar eden modda para birimi seçimi Step 5'te ayrıca eklenir.)

- [ ] **Step 5: Tekrar eden moda özel alanlar ekle (para birimi + bitiş ayı)**

Step 4'teki taksit sarmalayıcısından **sonra**, "Payment Date" bloğundan **önce** ekle:

```tsx
          {entryKind === "recurring" && (
            <>
              {/* Currency (recurring) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.currency}</label>
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">{t.recurringAmountHint}</p>
              </div>

              {/* End month (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.endMonthOptional}</label>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}
```

- [ ] **Step 6: Submit butonunun etiketini tür-bilinçli yap (opsiyonel ama tutarlı)**

Submit butonundaki `{loading ? t.adding : t.addPaymentTitle}` yeterli; değişiklik gerekmez.

- [ ] **Step 7: Manuel doğrulama**

Run: `npm run dev` ve tarayıcıda formu aç.
Expected: "Aylık tekrar eden" seçilince taksit/tutar alanları kaybolur, para birimi + bitiş ayı görünür; kaydedince yeni hatırlatıcı oluşur (Network'te `POST /api/recurring` 201).

- [ ] **Step 8: Commit**

```bash
git add src/components/PaymentForm.tsx
git commit -m "feat(form): add recurring payment type toggle"
```

---

### Task 10: CalendarView — occurrence render + satır içi tutar + ödendi/sil

**Files:**
- Modify: `src/components/CalendarView.tsx`

> Bu, dosyanın `getPaymentsForMonth` `{ payment, installment }` modelinden `Occurrence` modeline geçişidir. `recurrings` prop'u eklenir (varsayılan `[]`), böylece dashboard henüz geçmeden de regresyon olmaz.

- [ ] **Step 1: Import ve prop'ları güncelle**

Üstteki import'ları değiştir:

```tsx
import { useState } from "react";
import { Payment, RecurringPayment, Occurrence } from "@/types";
import { getOccurrencesForMonth, getCurrencySymbol } from "@/lib/payments";
```

`Props` interface'ine `recurrings` ekle:

```tsx
interface Props {
  payments: Payment[];
  recurrings?: RecurringPayment[];
  userMap?: UserMap;
  onUpdated: () => void;
  onDaySelected?: (date: Date | null) => void;
  onMonthChange?: (date: Date) => void;
}
```

Bileşen imzasını güncelle:

```tsx
export default function CalendarView({ payments, recurrings = [], userMap = {}, onUpdated, onDaySelected, onMonthChange }: Props) {
```

- [ ] **Step 2: monthPayments'ı occurrences'a çevir**

`const monthPayments = getPaymentsForMonth(payments, year, month);` satırını değiştir:

```tsx
  const occurrences = getOccurrencesForMonth(payments, recurrings, year, month);
```

`totalDue` / `totalPaid` / `headerSummary` hesaplarını occurrence'lar üzerinden ve **tutarı null olanları atlayarak** güncelle:

```tsx
  const totalDue = occurrences.reduce((s, o) => s + (o.amount ?? 0), 0);
  const totalPaid = occurrences
    .filter((o) => o.isPaid)
    .reduce((s, o) => s + (o.amount ?? 0), 0);

  const headerSummary = (() => {
    const paid: Record<string, number> = {};
    const due: Record<string, number> = {};
    for (const o of occurrences) {
      if (o.amount == null) continue;
      const cur = o.currency ?? "TRY";
      due[cur] = (due[cur] ?? 0) + o.amount;
      if (o.isPaid) paid[cur] = (paid[cur] ?? 0) + o.amount;
    }
    return Object.keys(due)
      .map((cur) => {
        const sym = getCurrencySymbol(cur);
        return `${sym}${fmt(paid[cur] ?? 0)} ${t.paid} / ${sym}${fmt(due[cur])} ${t.total}`;
      })
      .join(" · ");
  })();
```

- [ ] **Step 3: byDay haritasını occurrence'a göre kur**

`const byDay = ...` ve `selectedPayments` bloğunu değiştir:

```tsx
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = format(o.dueDate, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(o);
  }

  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedOccurrences = selectedKey ? (byDay.get(selectedKey) ?? []) : [];
```

- [ ] **Step 4: Eylem fonksiyonlarını occurrence-bilinçli yap**

`togglePaid` ve `deletePayment`'i değiştir / ekle:

```tsx
  async function togglePaid(o: Occurrence) {
    const key = `${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}`;
    setLoading(key);
    if (o.kind === "installment") {
      const newPaid = o.isPaid ? o.installmentIndex! : o.installmentIndex! + 1;
      await fetch(`/api/payments/${o.sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_installments: newPaid }),
      });
    } else {
      await fetch(`/api/recurring/${o.sourceId}/entry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: o.period, is_paid: !o.isPaid }),
      });
    }
    onUpdated();
    setLoading(null);
  }

  async function saveAmount(o: Occurrence, value: string) {
    setLoading(`amount-${o.sourceId}-${o.period}`);
    await fetch(`/api/recurring/${o.sourceId}/entry`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: o.period, amount: value === "" ? null : Number(value) }),
    });
    onUpdated();
    setLoading(null);
  }

  async function deleteOccurrence(o: Occurrence) {
    if (o.kind === "installment") {
      if (!confirm(`"${o.name}" silinsin mi?`)) return;
      setLoading(`delete-${o.sourceId}`);
      await fetch(`/api/payments/${o.sourceId}`, { method: "DELETE" });
    } else {
      if (!confirm(t.recurringDeleteConfirm)) return;
      setLoading(`delete-${o.sourceId}`);
      await fetch(`/api/recurring/${o.sourceId}`, { method: "DELETE" });
    }
    onUpdated();
    setLoading(null);
  }
```

- [ ] **Step 5: Gün hücresi render'ını occurrence'a göre güncelle**

`days.map(...)` içinde `const dayPayments = byDay.get(key) ?? [];` aynı kalır ama tipi artık `Occurrence[]`. `allPaid` ve dot/amount render'ını değiştir:

```tsx
            const dayItems = byDay.get(key) ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const hasItems = dayItems.length > 0;
            const allPaid = hasItems && dayItems.every((o) => o.isPaid);
            const hasBorder = i % 7 !== 6;
```

Dot bloğunu değiştir:

```tsx
                {hasItems && (
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayItems.slice(0, 4).map((o) => (
                      <span
                        key={`${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}`}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: o.isPaid ? "#86EFAC" : userColor(o.user_id, userMap),
                        }}
                      />
                    ))}
                    {dayItems.length > 4 && (
                      <span className="text-[10px] text-gray-400">+{dayItems.length - 4}</span>
                    )}
                  </div>
                )}
```

Gün-toplam rozetini değiştir (**tutarı null olanları atla**):

```tsx
                {hasItems && (() => {
                  const by: Record<string, number> = {};
                  for (const o of dayItems) {
                    if (o.amount == null) continue;
                    const cur = o.currency ?? "TRY";
                    by[cur] = (by[cur] ?? 0) + o.amount;
                  }
                  return Object.entries(by).map(([cur, amt]) => (
                    <span key={cur} className={`text-[10px] font-medium leading-none ${allPaid ? "text-green-500" : "text-blue-500"}`}>
                      {getCurrencySymbol(cur)}{fmt(amt)}
                    </span>
                  ));
                })()}
```

- [ ] **Step 6: Seçili gün detayını occurrence'a göre yeniden yaz**

`{selectedPayments.length === 0 && ...}` ve detay listesinin tamamını şununla değiştir (selectedOccurrences kullanır; recurring için satır içi tutar input'u, taksit için mevcut etiket):

```tsx
      {selectedDay && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            {format(selectedDay, "d MMMM yyyy", { locale })}
            {selectedOccurrences.length === 0 && (
              <span className="font-normal text-gray-400 ml-2">{t.noPaymentsDay}</span>
            )}
          </h3>

          {selectedOccurrences.length > 0 && (
            <div className="space-y-2">
              {selectedOccurrences.map((o) => {
                const key = `${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}`;
                const isLoadingItem = loading === key || loading === `delete-${o.sourceId}` || loading === `amount-${o.sourceId}-${o.period}`;
                const color = userColor(o.user_id, userMap);
                const addedBy = userMap[o.user_id];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      o.isPaid ? "bg-green-50 border-green-100" : "bg-white border-gray-100"
                    }`}
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <button
                      disabled={isLoadingItem}
                      onClick={() => togglePaid(o)}
                      className="shrink-0 transition hover:scale-110 disabled:opacity-50"
                    >
                      {o.isPaid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <span className={`font-medium text-sm ${o.isPaid ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {o.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">
                          {o.kind === "installment"
                            ? `${t.installmentOf} ${o.installmentIndex! + 1} ${t.of} ${o.totalInstallments}`
                            : t.recurringBadge}
                        </p>
                        {addedBy && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-200">·</span>
                            {addedBy.avatar_url ? (
                              <img src={addedBy.avatar_url} alt="" className="w-3.5 h-3.5 rounded-full" />
                            ) : (
                              <span
                                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {(addedBy.name ?? addedBy.email)[0].toUpperCase()}
                              </span>
                            )}
                            <span className="text-xs text-gray-400 truncate max-w-[80px]">
                              {addedBy.name ?? addedBy.email}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {o.kind === "recurring" ? (
                      <input
                        key={`amt-${o.sourceId}-${o.period}-${o.amount ?? "x"}`}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isLoadingItem}
                        defaultValue={o.amount ?? ""}
                        placeholder={t.enterAmount}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== String(o.amount ?? "")) saveAmount(o, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="w-28 text-right text-sm font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                    ) : (
                      <span className={`text-sm font-semibold shrink-0 ${o.isPaid ? "text-gray-400" : "text-gray-900"}`}>
                        {getCurrencySymbol(o.currency)}{fmt(o.amount ?? 0, 2)}
                      </span>
                    )}

                    <button
                      disabled={isLoadingItem}
                      onClick={() => deleteOccurrence(o)}
                      className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
```

> Recurring tutar input'u uncontrolled (`defaultValue`). `onUpdated` sonrası taze tutarın yansıması için input'a `o.amount`'ı içeren bir `key` verildi (yukarıda); böylece tutar değişince React input'u yeniden kurar.

- [ ] **Step 7: Build + manuel doğrulama**

Run: `npx tsc --noEmit` → hata yok.
Run: `npm run dev`, takvimde tekrar eden hatırlatıcının gününe tıkla; tutar input'una değer gir → kaydolur; ödendi işaretle → yeşile döner; sil → onayla.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarView.tsx
git commit -m "feat(calendar): render occurrences with inline recurring amount edit"
```

---

### Task 11: PayUntil — aralıktaki occurrence'lar

**Files:**
- Modify: `src/components/PayUntil.tsx`

- [ ] **Step 1: Import ve prop'ları güncelle**

```tsx
import { useMemo, useState } from "react";
import { Payment, RecurringPayment } from "@/types";
import { getOccurrencesInRange, getCurrencySymbol } from "@/lib/payments";
```

```tsx
interface Props {
  payments: Payment[];
  recurrings?: RecurringPayment[];
}

export default function PayUntil({ payments, recurrings = [] }: Props) {
```

- [ ] **Step 2: results hesabını occurrence'a çevir**

`results` useMemo'sunu değiştir:

```tsx
  const results = useMemo(() => {
    if (!endDate) return [];
    const [ey, em, ed] = endDate.split("-").map(Number);
    const end = new Date(ey, em - 1, ed);
    end.setHours(23, 59, 59, 999);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (end < now) return [];

    return getOccurrencesInRange(payments, recurrings, now, end).filter((o) => !o.isPaid);
  }, [payments, recurrings, endDate]);
```

- [ ] **Step 3: byCurrency ve breakdown render'ını güncelle**

`byCurrency` (tutarı null olanları atla):

```tsx
  const byCurrency = results.reduce((acc, o) => {
    if (o.amount == null) return acc;
    const cur = o.currency ?? "TRY";
    acc[cur] = (acc[cur] ?? 0) + o.amount;
    return acc;
  }, {} as Record<string, number>);
```

Breakdown listesini (`results.map(...)`) değiştir — tutarı null ise "—" göster:

```tsx
            {results.map((o, i) => (
              <div
                key={`${o.sourceId}-${i}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-gray-800 font-medium truncate">{o.name}</span>
                  <span className="text-gray-400 text-xs shrink-0">
                    {o.dueDate.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <span className="font-semibold text-gray-700 shrink-0 ml-3">
                  {o.amount == null ? "—" : `${getCurrencySymbol(o.currency)}${fmt(o.amount)}`}
                </span>
              </div>
            ))}
```

> `hasTotals` `Object.keys(byCurrency).length > 0` olarak kalır; ama tutarı null reminder'lar varken bile liste gösterilmeli. `hasTotals` yerine listeyi `results.length > 0` ile koşullandır: üstteki `{hasTotals ? (` ifadesini `{results.length > 0 ? (` yap; para birimi kutuları `Object.entries(byCurrency)` ile zaten boşsa render edilmez.

- [ ] **Step 4: Build + commit**

Run: `npx tsc --noEmit` → hata yok.

```bash
git add src/components/PayUntil.tsx
git commit -m "feat(payuntil): include recurring occurrences in range"
```

---

### Task 12: Dashboard — recurrings fetch + toplamlar + prop geçişi

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Import ve state ekle**

Import satırını güncelle:

```tsx
import { Payment, RecurringPayment, Team } from "@/types";
import { getOccurrencesForMonth, recurringOccurrenceForMonth, getCurrencySymbol } from "@/lib/payments";
```

State ekle (`const [payments, setPayments] = ...` yanına):

```tsx
  const [recurrings, setRecurrings] = useState<RecurringPayment[]>([]);
```

- [ ] **Step 2: Recurrings fetch'i ekle**

`fetchPayments` callback'inden sonra ekle:

```tsx
  const fetchRecurrings = useCallback(async () => {
    const res = await fetch("/api/recurring?filter=all");
    if (res.ok) setRecurrings(await res.json());
  }, []);
```

Mevcut `useEffect`'i güncelle:

```tsx
  useEffect(() => {
    if (status === "authenticated") {
      fetchPayments();
      fetchTeams();
      fetchRecurrings();
    }
  }, [status, fetchPayments, fetchTeams, fetchRecurrings]);
```

- [ ] **Step 3: filteredRecurrings + occurrence tabanlı toplamlar**

`filteredPayments` tanımından sonra ekle:

```tsx
  const filteredRecurrings = recurrings.filter((r) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "personal") return !r.team_id;
    return r.team_id === activeFilter;
  });
```

`currentMonthEntries` satırını değiştir:

```tsx
  const currentMonthEntries = getOccurrencesForMonth(filteredPayments, filteredRecurrings, calYear, calMonth);
```

`weekEntries`'i occurrence'a göre güncelle:

```tsx
  const weekEntries = currentMonthEntries.filter((o) => {
    const d = o.dueDate;
    return d >= weekStart && d <= weekEnd && !o.isPaid;
  });
```

`toCurrencyLines`'ı occurrence imzasına çevir (tutarı null olanları atla):

```tsx
  function toCurrencyLines(entries: { amount: number | null; isPaid: boolean; currency: string }[]): string[] {
    const by: Record<string, number> = {};
    for (const o of entries) {
      if (o.isPaid || o.amount == null) continue;
      const cur = o.currency ?? "TRY";
      by[cur] = (by[cur] ?? 0) + o.amount;
    }
    const items = Object.entries(by);
    if (items.length === 0) return [`${getCurrencySymbol("TRY")}0`];
    return items.map(([cur, amt]) => `${getCurrencySymbol(cur)}${fmtStat(amt)}`);
  }
```

`monthlyLines`/`weeklyLines` çağrıları değişmez (artık occurrence dizileri geçiyor — `Occurrence` `amount/isPaid/currency` alanlarına sahip).

- [ ] **Step 4: Aktif ödeme sayısına aktif tekrar edenleri ekle**

`activePayments` StatCard'ındaki `lines` ifadesini değiştir:

```tsx
            lines={[(
              filteredPayments.filter((p) => p.paid_installments < p.total_installments).length +
              filteredRecurrings.filter((r) => recurringOccurrenceForMonth(r, new Date().getFullYear(), new Date().getMonth()) !== null).length
            ).toString()]}
```

- [ ] **Step 5: CalendarView ve PayUntil'e recurrings prop'unu geç**

```tsx
            <CalendarView
              payments={filteredPayments}
              recurrings={filteredRecurrings}
              userMap={userMap}
              onUpdated={() => { fetchPayments(); fetchRecurrings(); }}
              onDaySelected={setSelectedCalendarDay}
              onMonthChange={setCalendarDate}
            />
            <PayUntil payments={filteredPayments} recurrings={filteredRecurrings} />
```

- [ ] **Step 6: Form oluşturunca recurrings'i de yenile**

`PaymentForm` `onCreated` prop'unu güncelle:

```tsx
          onCreated={() => { fetchPayments(); fetchRecurrings(); }}
```

- [ ] **Step 7: Build + manuel doğrulama**

Run: `npx tsc --noEmit` → hata yok.
Run: `npm run dev`; tekrar eden hatırlatıcıya tutar girince Aylık/Haftalık toplamların ve "Aktif Ödemeler" sayısının güncellendiğini, takvim altındaki PayUntil'de göründüğünü doğrula.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): wire recurring payments into totals and views"
```

---

### Task 13: "Tümü" görünümünde RecurringCard

**Files:**
- Create: `src/components/RecurringCard.tsx`
- Modify: `src/app/dashboard/page.tsx` ("all" görünümü)

- [ ] **Step 1: RecurringCard bileşenini oluştur**

`src/components/RecurringCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { RecurringPayment } from "@/types";
import { getCurrencySymbol } from "@/lib/payments";
import { Trash2, Pencil, X, RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { UserMap } from "@/components/CalendarView";

const PALETTE = ["#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#10B981", "#EC4899", "#F97316", "#14B8A6"];
function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function userColor(userId: string, userMap?: UserMap): string {
  return userMap?.[userId]?.color ?? hashColor(userId);
}

interface Props {
  recurring: RecurringPayment;
  userMap?: UserMap;
  canManage?: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function RecurringCard({ recurring, userMap = {}, canManage = false, onUpdated, onDeleted }: Props) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const color = userColor(recurring.user_id, userMap);
  const sym = getCurrencySymbol(recurring.currency);
  const dayLabel = t.everyMonthDay.replace("{day}", String(recurring.day_of_month));
  const endLabel = recurring.end_month
    ? `${t.untilMonth} ${recurring.end_month.slice(0, 7)}`
    : t.noEndDate;

  async function handleDelete() {
    if (!confirm(t.recurringDeleteConfirm)) return;
    setLoading(true);
    await fetch(`/api/recurring/${recurring.id}`, { method: "DELETE" });
    onDeleted();
    setLoading(false);
  }

  return (
    <>
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
        style={{ borderLeftWidth: 3, borderLeftColor: color }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-purple-500 shrink-0" />
              <h3 className="font-semibold text-gray-900 truncate">{recurring.name}</h3>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              <span>{dayLabel}</span>
              <span>·</span>
              <span>{t.recurringBadge}</span>
              <span>·</span>
              <span>{sym} {recurring.currency}</span>
              <span>·</span>
              <span className="text-gray-400">{endLabel}</span>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowEdit(true)}
                disabled={loading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EditRecurringModal
          recurring={recurring}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onUpdated(); setShowEdit(false); }}
          t={t}
        />
      )}
    </>
  );
}

function EditRecurringModal({
  recurring,
  onClose,
  onSaved,
  t,
}: {
  recurring: RecurringPayment;
  onClose: () => void;
  onSaved: () => void;
  t: any;
}) {
  const [name, setName] = useState(recurring.name);
  const [day, setDay] = useState(String(recurring.day_of_month));
  const [currency, setCurrency] = useState(recurring.currency ?? "TRY");
  const [endMonth, setEndMonth] = useState(recurring.end_month ? recurring.end_month.slice(0, 7) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/recurring/${recurring.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        day_of_month: Number(day),
        currency,
        end_month: endMonth || null,
      }),
    });
    if (res.ok) onSaved();
    else { const d = await res.json(); setError(d.error ?? "Error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{t.recurringType}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.paymentName}</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.dayOfMonthLabel}</label>
            <input
              type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.currency}</label>
            <select
              value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TRY">₺ TRY</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.endMonthOptional}</label>
            <input
              type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{t.cancel}</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60">{saving ? "…" : t.save}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Dashboard "all" görünümüne RecurringCard'ları ekle**

`src/app/dashboard/page.tsx` import'una ekle:

```tsx
import RecurringCard from "@/components/RecurringCard";
```

"all" görünümündeki içerik bloğunu güncelle. Mevcut:

```tsx
        {activeView === "all" && (
          <div>
            {filteredPayments.length === 0 ? (
```

şu şekilde değiştir (boşluk kontrolü artık recurring'leri de hesaba katar, ve liste recurring kartlarını da render eder):

```tsx
        {activeView === "all" && (
          <div>
            {filteredPayments.length === 0 && filteredRecurrings.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">{t.noPayments}</p>
                <p className="text-sm mt-1">{t.noPaymentsHint}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRecurrings.map((r) => {
                  const currentUserId = (session?.user as any)?.id;
                  const isOwner = r.user_id === currentUserId;
                  const isTeamAdmin = r.team_id
                    ? teams.find((tm) => tm.id === r.team_id)?.members?.find((m) => m.user_id === currentUserId)?.role === "owner"
                    : false;
                  return (
                    <RecurringCard
                      key={r.id}
                      recurring={r}
                      userMap={userMap}
                      canManage={isOwner || isTeamAdmin}
                      onUpdated={fetchRecurrings}
                      onDeleted={fetchRecurrings}
                    />
                  );
                })}
                {filteredPayments.map((p) => {
                  const currentUserId = (session?.user as any)?.id;
                  const isOwner = p.user_id === currentUserId;
                  const isTeamAdmin = p.team_id
                    ? teams.find((tm) => tm.id === p.team_id)?.members?.find((m) => m.user_id === currentUserId)?.role === "owner"
                    : false;
                  return (
                    <PaymentCard
                      key={p.id}
                      payment={p}
                      userMap={userMap}
                      canManage={isOwner || isTeamAdmin}
                      onUpdated={fetchPayments}
                      onDeleted={fetchPayments}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 3: Build + manuel doğrulama**

Run: `npx tsc --noEmit` → hata yok.
Run: `npm run dev`; "Tümü" sekmesinde tekrar eden hatırlatıcı kartının göründüğünü, düzenle (ad/gün/bitiş) ve sil'in çalıştığını doğrula.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecurringCard.tsx src/app/dashboard/page.tsx
git commit -m "feat(dashboard): add RecurringCard to all-payments view"
```

---

### Task 14: E-posta cron entegrasyonu

**Files:**
- Modify: `src/app/api/cron/send-reminders/route.ts`

- [ ] **Step 1: Import ve DueItem'i güncelle**

Import satırını değiştir:

```ts
import { getInstallments, recurringOccurrenceForMonth, getCurrencySymbol } from "@/lib/payments";
import { Payment, RecurringPayment, User } from "@/types";
```

`DueItem` tipine `isRecurring` ekle:

```ts
type DueItem = {
  paymentName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number | null;
  currency: string;
  isRecurring?: boolean;
};
```

- [ ] **Step 2: Recurring şablonlarını çek ve tara**

Mevcut `payments` taksit döngüsünden **sonra** (`dueByUser` doldurulduktan sonra, `const results` tanımından önce) ekle:

```ts
  // Recurring reminders due tomorrow
  const { data: recurrings } = await db
    .from("recurring_payments")
    .select("*, entries:recurring_entries(*), user:users!recurring_payments_user_id_fkey(id, name, email)");

  for (const r of (recurrings ?? []) as (RecurringPayment & { user: User })[]) {
    if (!r.user?.email) continue;
    const occ = recurringOccurrenceForMonth(r, tYear, tMonth);
    if (!occ) continue;
    if (occ.dueDate.getDate() !== tDay) continue;
    if (occ.isPaid) continue;

    if (!dueByUser.has(r.user_id)) {
      dueByUser.set(r.user_id, { user: r.user, items: [] });
    }
    dueByUser.get(r.user_id)!.items.push({
      paymentName: r.name,
      installmentNumber: 0,
      totalInstallments: 0,
      amount: occ.amount,
      currency: r.currency ?? "TRY",
      isRecurring: true,
    });
  }
```

- [ ] **Step 3: E-posta satır render'ını recurring-bilinçli yap**

`rows` map'ini değiştir (recurring'de "Taksit" sütunu "—", tutar yoksa "—"):

```ts
    const rows = items
      .map((item) => {
        const taksit = item.isRecurring ? "—" : `${item.installmentNumber}/${item.totalInstallments}`;
        const tutar = item.amount == null
          ? "—"
          : `${getCurrencySymbol(item.currency)}${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(item.amount)}`;
        return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.paymentName}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${taksit}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${tutar}</td>
          </tr>`;
      })
      .join("");
```

- [ ] **Step 4: Build + commit**

Run: `npx tsc --noEmit` → hata yok.

```bash
git add src/app/api/cron/send-reminders/route.ts
git commit -m "feat(cron): include recurring reminders in email reminders"
```

---

### Task 15: Son doğrulama

**Files:** (yok — yalnızca doğrulama)

- [ ] **Step 1: Birim testleri**

Run: `npm test`
Expected: PASS (payments.test.ts tüm bloklar yeşil).

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: Hata yok (uyarılar kabul edilebilir).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: Başarılı derleme; `/api/recurring`, `/api/recurring/[id]`, `/api/recurring/[id]/entry` route'ları listelenir.

- [ ] **Step 5: Uçtan uca manuel doğrulama (`npm run dev`)**

Sırayla doğrula:
1. "Ödeme Ekle" → "Aylık tekrar eden" → ad + ilk tarih (örn. ayın 15'i) + opsiyonel bitiş ayı ile oluştur.
2. Takvimde her ay 15'inde nokta görünür (tutar boş → toplama katkı yok).
3. Bir günün tutarını gir → kaydolur, aylık/haftalık toplam güncellenir, başka aya geçince o ay yine boş.
4. Ödendi işaretle → yeşil; PayUntil'den düşer.
5. "Tümü" sekmesinde RecurringCard düzenle/sil çalışır.
6. (Opsiyonel) Cron'u elle test et: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-reminders` — yarın 15'iyse recurring mailde görünür.

- [ ] **Step 6: Branch'i tamamla**

`superpowers:finishing-a-development-branch` skill'i ile merge/PR kararını ver.

---

## Self-Review Notları (plan yazarı tarafından)

- **Spec kapsamı:** 2 tablo (Task 1), tipler (Task 2), occurrence katmanı (Task 4), API GET/POST/PATCH/DELETE/entry (Task 5-7), form toggle (Task 9), takvim satır içi tutar (Task 10), PayUntil (Task 11), dashboard toplamları + aktif sayı (Task 12), RecurringCard (Task 13), e-posta cron (Task 14), vitest (Task 3), boş-tutar=sadece nokta (Task 10 Step 2/5, Task 11/12 null atlama) — hepsi karşılandı.
- **Tip tutarlılığı:** `Occurrence` alanları (`sourceId`, `installmentIndex`, `period`, `entryId`, `amount: number|null`) tüm task'larda tutarlı. `recurringOccurrenceForMonth`/`getOccurrencesForMonth`/`getOccurrencesInRange` adları her yerde aynı.
- **Bilinen risk:** Supabase embed FK adları (`recurring_payments_user_id_fkey`, `entries:recurring_entries`) Supabase'in otomatik adlandırmasına dayanır; ilk GET'te 500 alınırsa hata mesajındaki ilişki adını kullan.
