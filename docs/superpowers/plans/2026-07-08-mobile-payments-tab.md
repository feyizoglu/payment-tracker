# Mobile Ödemeler (Payments) Tab Implementation Plan (Plan 3b/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mobile Ödemeler tab from a flat payment list into the month-based Payments screen: fetch payments + recurring reminders, compute this month's occurrences via `@ptracker/shared/payments`, and show them in two toggleable views — a day-grouped monthly **list** and a **calendar grid** — with per-occurrence mark-paid.

**Architecture:** A single screen (`mobile/src/app/(app)/index.tsx`) holds month state + a list/calendar view toggle. It fetches `/api/payments?filter=all` and `/api/recurring?filter=all`, then calls the already-shared, already-tested `getOccurrencesForMonth(payments, recurrings, year, month)`. All the app-specific derivations (mark-paid request shape, day grouping, calendar week layout) are pure functions in `mobile/src/lib/` and are unit-tested with Vitest; the RN components are verified by `tsc` + `expo export` bundling. Mark-paid POSTs the mutation then refetches (same model as the web `onUpdated`).

**Tech Stack:** Expo SDK 57 + Expo Router v57, TypeScript, NativeWind, date-fns (already a mobile dep), `@ptracker/shared` (occurrence math + types), Vitest.

---

## Prerequisites (context — no action)

- `getOccurrencesForMonth(payments: Payment[], recurrings: RecurringPayment[], year: number, month /*0-indexed*/): Occurrence[]` is exported from `@ptracker/shared/payments`, returns occurrences sorted by day, and is fully unit-tested on the web side.
- `Occurrence` (from `@ptracker/shared/types`): `{ kind: "installment"|"recurring"; sourceId; name; currency; dueDate: Date; amount: number|null; isPaid; installmentIndex?; totalInstallments?; period?; overridden? }`.
- Mark-paid contracts (from the web `CalendarView.togglePaid`):
  - installment → `PATCH /api/payments/:sourceId` body `{ paid_installments }` where `paid_installments = isPaid ? installmentIndex : installmentIndex + 1`.
  - recurring → `PUT /api/recurring/:sourceId/entry` body `{ period, is_paid: !isPaid }`.
- The mobile API client (`mobile/src/lib/api.ts`) currently exposes `get/post/patch/del` — **no `put`** (Task 1 adds it; recurring mark-paid needs PUT).
- `getCurrencySymbol(currency)` is exported from `@ptracker/shared/payments`.
- `RecurringPayment` type is in `@ptracker/shared/types`; `/api/recurring?filter=all` returns `RecurringPayment[]` (with `entries`).

---

## File Structure

- `mobile/src/lib/api.ts` — **modify**: add `put` to `ApiClient` + `createApiClient`.
- `mobile/src/lib/api.test.ts` — **modify**: add a `put` test.
- `mobile/src/lib/occurrences.ts` — **new**: `markPaidRequest`, `occurrenceKey`, `groupOccurrencesByDay` (pure).
- `mobile/src/lib/occurrences.test.ts` — **new**: unit tests for the above.
- `mobile/src/lib/calendar.ts` — **new**: `buildCalendarWeeks` (pure, date-fns).
- `mobile/src/lib/calendar.test.ts` — **new**: unit tests.
- `mobile/src/components/occurrence-row.tsx` — **new**: one occurrence (paid toggle + name + badge + amount).
- `mobile/src/components/month-header.tsx` — **new**: ‹ month-label › + list/calendar toggle.
- `mobile/src/components/month-list.tsx` — **new**: day-grouped list of occurrences.
- `mobile/src/components/payments-calendar.tsx` — **new**: calendar grid + selected-day occurrence list.
- `mobile/src/app/(app)/index.tsx` — **modify**: the Ödemeler screen (data fetch + month state + view toggle + mark-paid).

---

## Task 1: Add `put` to the mobile API client

The recurring mark-paid endpoint is a PUT; the client lacks it.

**Files:**
- Modify: `mobile/src/lib/api.ts`
- Modify: `mobile/src/lib/api.test.ts`

- [ ] **Step 1: Add a failing test**

In `mobile/src/lib/api.test.ts`, add this test inside the existing `describe("createApiClient", ...)` block (place it after the POST test):

```ts
  it("serializes the body and sets method PUT on put", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken: async () => null,
      fetchImpl,
    });
    await client.put("/api/recurring/r1/entry", { period: "2026-07-01", is_paid: true });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ period: "2026-07-01", is_paid: true }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd mobile && npx vitest run src/lib/api.test.ts`
Expected: FAIL — `client.put is not a function`.

- [ ] **Step 3: Add `put` to the interface and implementation**

In `mobile/src/lib/api.ts`, add `put` to the `ApiClient` interface (after `post`):

```ts
  put<T>(path: string, body: unknown): Promise<T>;
```

And add its implementation in the returned object of `createApiClient` (after the `post` method):

```ts
    put<T>(path: string, body: unknown) {
      return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
    },
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd mobile && npx vitest run src/lib/api.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/src/lib/api.ts mobile/src/lib/api.test.ts
git commit -m "feat(mobile): add put() to the API client"
```

---

## Task 2: Pure occurrence helpers (`occurrences.ts`)

Mark-paid request shape, a stable key, and day grouping — all pure and unit-tested.

**Files:**
- Create: `mobile/src/lib/occurrences.ts`
- Create: `mobile/src/lib/occurrences.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/lib/occurrences.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { markPaidRequest, occurrenceKey, groupOccurrencesByDay } from "./occurrences";
import type { Occurrence } from "@ptracker/shared/types";

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    kind: "installment", sourceId: "p1", name: "Laptop", currency: "TRY",
    user_id: "u1", team_id: null, dueDate: new Date(2026, 6, 10), amount: 100,
    isPaid: false, installmentIndex: 2, totalInstallments: 12, ...over,
  };
}

describe("markPaidRequest", () => {
  it("marks an unpaid installment paid by advancing paid_installments to index+1", () => {
    const r = markPaidRequest(occ({ kind: "installment", installmentIndex: 2, isPaid: false }));
    expect(r).toEqual({ url: "/api/payments/p1", method: "PATCH", body: { paid_installments: 3 } });
  });
  it("unmarks a paid installment by setting paid_installments back to its index", () => {
    const r = markPaidRequest(occ({ kind: "installment", installmentIndex: 2, isPaid: true }));
    expect(r.body).toEqual({ paid_installments: 2 });
  });
  it("toggles a recurring entry via PUT with the period", () => {
    const r = markPaidRequest(occ({ kind: "recurring", sourceId: "r1", period: "2026-07-01", isPaid: false, installmentIndex: undefined }));
    expect(r).toEqual({ url: "/api/recurring/r1/entry", method: "PUT", body: { period: "2026-07-01", is_paid: true } });
  });
});

describe("occurrenceKey", () => {
  it("is unique across installment lines and currencies", () => {
    const a = occurrenceKey(occ({ installmentIndex: 0, currency: "TRY" }));
    const b = occurrenceKey(occ({ installmentIndex: 0, currency: "USD" }));
    const c = occurrenceKey(occ({ installmentIndex: 1, currency: "TRY" }));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("groupOccurrencesByDay", () => {
  it("groups by calendar day and sorts ascending", () => {
    const groups = groupOccurrencesByDay([
      occ({ dueDate: new Date(2026, 6, 20), name: "B" }),
      occ({ dueDate: new Date(2026, 6, 5), name: "A" }),
      occ({ dueDate: new Date(2026, 6, 5), name: "A2" }),
    ]);
    expect(groups.map((g) => g.date.getDate())).toEqual([5, 20]);
    expect(groups[0].items.map((o) => o.name)).toEqual(["A", "A2"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx vitest run src/lib/occurrences.test.ts`
Expected: FAIL — `./occurrences` does not exist.

- [ ] **Step 3: Implement `mobile/src/lib/occurrences.ts`**

```ts
import type { Occurrence } from "@ptracker/shared/types";

export interface MarkPaidRequest {
  url: string;
  method: "PATCH" | "PUT";
  body: Record<string, unknown>;
}

// Builds the API request that toggles an occurrence's paid state.
// Installments advance/rewind the parent payment's paid_installments count;
// recurring entries flip the per-period is_paid flag.
export function markPaidRequest(o: Occurrence): MarkPaidRequest {
  if (o.kind === "installment") {
    const idx = o.installmentIndex ?? 0;
    const paid_installments = o.isPaid ? idx : idx + 1;
    return { url: `/api/payments/${o.sourceId}`, method: "PATCH", body: { paid_installments } };
  }
  return {
    url: `/api/recurring/${o.sourceId}/entry`,
    method: "PUT",
    body: { period: o.period, is_paid: !o.isPaid },
  };
}

// A stable React key — unique across a payment's installment lines, a recurring
// payment's periods, and multi-currency lines that share a due date.
export function occurrenceKey(o: Occurrence): string {
  return `${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}-${o.currency}`;
}

export interface DayGroup {
  key: string;
  date: Date;
  items: Occurrence[];
}

// Groups occurrences by calendar day (local time), ascending by date. Input
// order within a day is preserved (getOccurrencesForMonth already sorts).
export function groupOccurrencesByDay(occurrences: Occurrence[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const o of occurrences) {
    const d = o.dueDate;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let group = map.get(key);
    if (!group) {
      group = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      map.set(key, group);
    }
    group.items.push(o);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx vitest run src/lib/occurrences.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/src/lib/occurrences.ts mobile/src/lib/occurrences.test.ts
git commit -m "feat(mobile): pure occurrence helpers (mark-paid request, key, day grouping)"
```

---

## Task 3: Calendar week layout (`calendar.ts`)

Pure month-grid helper for the calendar view.

**Files:**
- Create: `mobile/src/lib/calendar.ts`
- Create: `mobile/src/lib/calendar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/src/lib/calendar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCalendarWeeks } from "./calendar";

describe("buildCalendarWeeks", () => {
  it("returns Monday-first weeks of 7 days covering the whole month", () => {
    // July 2026: 1st is a Wednesday; month has 31 days.
    const weeks = buildCalendarWeeks(2026, 6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const flat = weeks.flat();
    // First cell is a Monday (getDay() === 1) on/before Jul 1.
    expect(flat[0].getDay()).toBe(1);
    // Grid contains every day of July.
    const julyDays = flat.filter((d) => d.getMonth() === 6).map((d) => d.getDate());
    expect(julyDays[0]).toBe(1);
    expect(julyDays[julyDays.length - 1]).toBe(31);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx vitest run src/lib/calendar.test.ts`
Expected: FAIL — `./calendar` does not exist.

- [ ] **Step 3: Implement `mobile/src/lib/calendar.ts`**

```ts
import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";

// Builds the Monday-first calendar grid (weeks of 7 days) that fully covers the
// given month, including the leading/trailing days from adjacent months. month
// is 0-indexed.
export function buildCalendarWeeks(year: number, month: number): Date[][] {
  const monthStart = startOfMonth(new Date(year, month, 1));
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx vitest run src/lib/calendar.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/src/lib/calendar.ts mobile/src/lib/calendar.test.ts
git commit -m "feat(mobile): pure calendar-week layout helper"
```

---

## Task 4: `OccurrenceRow` and `MonthHeader` components

Presentational RN pieces. Verified by `tsc`.

**Files:**
- Create: `mobile/src/components/occurrence-row.tsx`
- Create: `mobile/src/components/month-header.tsx`

- [ ] **Step 1: Create `mobile/src/components/occurrence-row.tsx`**

```tsx
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { getCurrencySymbol } from "@ptracker/shared/payments";

function typeBadge(o: Occurrence): string {
  if (o.kind === "recurring") return "Aylık";
  return `${(o.installmentIndex ?? 0) + 1}/${o.totalInstallments ?? "?"}`;
}

export function OccurrenceRow({
  occurrence,
  busy,
  onTogglePaid,
}: {
  occurrence: Occurrence;
  busy: boolean;
  onTogglePaid: (o: Occurrence) => void;
}) {
  const o = occurrence;
  return (
    <View
      className={`flex-row items-center gap-3 rounded-xl border p-3 ${
        o.isPaid ? "border-green-100 bg-green-50" : "border-gray-100 bg-white"
      }`}>
      <Pressable disabled={busy} onPress={() => onTogglePaid(o)} className="disabled:opacity-50">
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Text className={o.isPaid ? "text-green-500" : "text-gray-300"}>
            {o.isPaid ? "✓" : "○"}
          </Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Text className={`font-medium ${o.isPaid ? "text-gray-400 line-through" : "text-gray-800"}`}>
          {o.name}
        </Text>
        <Text className="mt-0.5 text-xs text-gray-400">{typeBadge(o)}</Text>
      </View>
      <Text className={`font-semibold ${o.isPaid ? "text-gray-400" : "text-gray-900"}`}>
        {o.amount == null ? "—" : `${getCurrencySymbol(o.currency)}${o.amount}`}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Create `mobile/src/components/month-header.tsx`**

```tsx
import { Pressable, Text, View } from "react-native";

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export type PaymentsView = "list" | "calendar";

export function MonthHeader({
  year,
  month,
  view,
  onPrev,
  onNext,
  onToggleView,
}: {
  year: number;
  month: number; // 0-indexed
  view: PaymentsView;
  onPrev: () => void;
  onNext: () => void;
  onToggleView: (v: PaymentsView) => void;
}) {
  return (
    <View className="border-b border-gray-100 bg-white px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onPrev} className="px-3 py-1">
          <Text className="text-xl text-gray-600">‹</Text>
        </Pressable>
        <Text className="text-base font-semibold text-gray-900">
          {TR_MONTHS[month]} {year}
        </Text>
        <Pressable onPress={onNext} className="px-3 py-1">
          <Text className="text-xl text-gray-600">›</Text>
        </Pressable>
      </View>
      <View className="mt-3 flex-row self-center rounded-lg bg-gray-100 p-0.5">
        {(["list", "calendar"] as const).map((v) => (
          <Pressable key={v} onPress={() => onToggleView(v)} className={`rounded-md px-4 py-1 ${view === v ? "bg-white" : ""}`}>
            <Text className={view === v ? "font-medium text-gray-900" : "text-gray-500"}>
              {v === "list" ? "Liste" : "Takvim"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/src/components/occurrence-row.tsx mobile/src/components/month-header.tsx
git commit -m "feat(mobile): OccurrenceRow + MonthHeader components"
```

---

## Task 5: `MonthList` and `PaymentsCalendar` views

The two body views. Both consume the pure helpers + `OccurrenceRow`.

**Files:**
- Create: `mobile/src/components/month-list.tsx`
- Create: `mobile/src/components/payments-calendar.tsx`

- [ ] **Step 1: Create `mobile/src/components/month-list.tsx`**

```tsx
import { Fragment } from "react";
import { Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { groupOccurrencesByDay, occurrenceKey } from "@/lib/occurrences";
import { OccurrenceRow } from "@/components/occurrence-row";

const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function MonthList({
  occurrences,
  busyKey,
  onTogglePaid,
}: {
  occurrences: Occurrence[];
  busyKey: string | null;
  onTogglePaid: (o: Occurrence) => void;
}) {
  const groups = groupOccurrencesByDay(occurrences);
  if (groups.length === 0) {
    return <Text className="p-6 text-center text-gray-500">Bu ay ödeme yok</Text>;
  }
  return (
    <View className="gap-4 p-4">
      {groups.map((g) => (
        <Fragment key={g.key}>
          <Text className="text-xs font-semibold text-gray-400">
            {g.date.getDate()} {TR_MONTHS_SHORT[g.date.getMonth()]}
          </Text>
          <View className="gap-2">
            {g.items.map((o) => (
              <OccurrenceRow
                key={occurrenceKey(o)}
                occurrence={o}
                busy={busyKey === occurrenceKey(o)}
                onTogglePaid={onTogglePaid}
              />
            ))}
          </View>
        </Fragment>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Create `mobile/src/components/payments-calendar.tsx`**

```tsx
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { buildCalendarWeeks } from "@/lib/calendar";
import { groupOccurrencesByDay, occurrenceKey } from "@/lib/occurrences";
import { OccurrenceRow } from "@/components/occurrence-row";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function PaymentsCalendar({
  year,
  month,
  occurrences,
  selectedDay,
  onSelectDay,
  busyKey,
  onTogglePaid,
}: {
  year: number;
  month: number; // 0-indexed
  occurrences: Occurrence[];
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  busyKey: string | null;
  onTogglePaid: (o: Occurrence) => void;
}) {
  const weeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const g of groupOccurrencesByDay(occurrences)) map.set(dayKey(g.date), g.items);
    return map;
  }, [occurrences]);

  const selectedKey = selectedDay ? dayKey(selectedDay) : null;
  const selectedItems = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  return (
    <View className="p-4">
      <View className="flex-row">
        {WEEKDAYS.map((d) => (
          <Text key={d} className="flex-1 text-center text-xs text-gray-400">{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((day) => {
            const inMonth = day.getMonth() === month;
            const has = byDay.has(dayKey(day));
            const selected = selectedKey === dayKey(day);
            return (
              <Pressable
                key={dayKey(day)}
                onPress={() => onSelectDay(day)}
                className={`h-12 flex-1 items-center justify-center ${selected ? "rounded-lg bg-blue-50" : ""}`}>
                <Text className={`text-sm ${inMonth ? "text-gray-800" : "text-gray-300"} ${selected ? "font-semibold text-blue-600" : ""}`}>
                  {day.getDate()}
                </Text>
                {has ? <View className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" /> : <View className="mt-0.5 h-1.5" />}
              </Pressable>
            );
          })}
        </View>
      ))}

      {selectedDay ? (
        <View className="mt-4 gap-2">
          {selectedItems.length === 0 ? (
            <Text className="text-center text-sm text-gray-400">Bu gün ödeme yok</Text>
          ) : (
            selectedItems.map((o) => (
              <OccurrenceRow
                key={occurrenceKey(o)}
                occurrence={o}
                busy={busyKey === occurrenceKey(o)}
                onTogglePaid={onTogglePaid}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/src/components/month-list.tsx mobile/src/components/payments-calendar.tsx
git commit -m "feat(mobile): MonthList + PaymentsCalendar view components"
```

---

## Task 6: Wire the Ödemeler screen + final verification

Replace the flat list screen with the month-based screen: fetch payments + recurrings, compute occurrences, toggle views, mark-paid → refetch.

**Files:**
- Modify: `mobile/src/app/(app)/index.tsx`

- [ ] **Step 1: Replace `mobile/src/app/(app)/index.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { Payment, RecurringPayment } from "@ptracker/shared/types";
import { getOccurrencesForMonth } from "@ptracker/shared/payments";
import { useAuth } from "@/lib/auth-context";
import { markPaidRequest, occurrenceKey } from "@/lib/occurrences";
import { MonthHeader, type PaymentsView } from "@/components/month-header";
import { MonthList } from "@/components/month-list";
import { PaymentsCalendar } from "@/components/payments-calendar";

export default function Payments() {
  const { api } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [recurrings, setRecurrings] = useState<RecurringPayment[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [view, setView] = useState<PaymentsView>("list");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([
        api.get<Payment[]>("/api/payments?filter=all"),
        api.get<RecurringPayment[]>("/api/recurring?filter=all"),
      ]);
      setPayments(p);
      setRecurrings(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setReady(true);
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

  const occurrences = useMemo(
    () => getOccurrencesForMonth(payments, recurrings, year, month),
    [payments, recurrings, year, month]
  );

  const shiftMonth = useCallback((delta: number) => {
    setSelectedDay(null);
    setMonth((m) => {
      const next = m + delta;
      if (next < 0) { setYear((y) => y - 1); return 11; }
      if (next > 11) { setYear((y) => y + 1); return 0; }
      return next;
    });
  }, []);

  const onTogglePaid = useCallback(
    async (o: Parameters<typeof markPaidRequest>[0]) => {
      const key = occurrenceKey(o);
      setBusyKey(key);
      try {
        const req = markPaidRequest(o);
        if (req.method === "PATCH") await api.patch(req.url, req.body);
        else await api.put(req.url, req.body);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Güncellenemedi");
      } finally {
        setBusyKey(null);
      }
    },
    [api, load]
  );

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <MonthHeader
        year={year}
        month={month}
        view={view}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        onToggleView={setView}
      />
      {error ? (
        <View className="bg-red-50 p-4">
          <Text className="text-red-700">{error}</Text>
          <Pressable onPress={load} className="mt-2">
            <Text className="text-brand">Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {view === "list" ? (
          <MonthList occurrences={occurrences} busyKey={busyKey} onTogglePaid={onTogglePaid} />
        ) : (
          <PaymentsCalendar
            year={year}
            month={month}
            occurrences={occurrences}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            busyKey={busyKey}
            onTogglePaid={onTogglePaid}
          />
        )}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Verify types + all mobile tests**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: `tsc` clean; all mobile unit tests pass (api, auth, config, wiring, occurrences, calendar).

- [ ] **Step 3: Verify the whole bundle builds**

Run: `cd mobile && npx expo export --platform android --output-dir /tmp/expo-3b && rm -rf /tmp/expo-3b`
Expected: export completes with no bundling errors (proves every new screen/component/module resolves, including `@ptracker/shared`).

- [ ] **Step 4: Verify root tooling is unaffected**

Run from repo root: `npx tsc --noEmit && npm test`
Expected: root `tsc` clean and web Vitest still passes (mobile changes never touched the Next.js app).

- [ ] **Step 5: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add "mobile/src/app/(app)/index.tsx"
git commit -m "feat(mobile): month-based Ödemeler tab with list + calendar views and mark-paid"
```

---

## Final verification (after all tasks)

- [ ] Mobile unit tests: `cd mobile && npm test` → all PASS (adds put, occurrences, calendar tests).
- [ ] Mobile types: `cd mobile && npx tsc --noEmit` → PASS.
- [ ] Mobile bundle: `cd mobile && npx expo export --platform android --output-dir /tmp/expo-3b` → completes; then `rm -rf /tmp/expo-3b`.
- [ ] Root untouched: from repo root `npx tsc --noEmit && npm test` → PASS.
- [ ] Manual (deferred to a Plan 4 dev build, not gating): with the app running, the Ödemeler tab shows the current month's occurrences; ‹ › navigates months; the Liste/Takvim toggle switches views; tapping a calendar day lists that day's occurrences; tapping the ○/✓ marks paid and the list refreshes.

## What this plan deliberately leaves to later plans

- **Plan 3c:** add/edit payment forms (multi-currency) + per-occurrence amount/date override bottom-sheets.
- **Plan 3d/3e/3f:** Ekonomi, Raporlar, and Ayarlar (teams/invite + language switch); the added-by user color/avatar and team filter on occurrence rows land with 3f.
