# Event Expense Splitting (Phase 1: schema, logic, API, web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends record what they paid at a shared event and for whom; the web app shows per-currency balances, suggests the fewest transfers to settle up, and records payments.

**Architecture:** Five new Supabase tables reached only through the server's service-role client. Pure split math lives in `shared/split.ts` (used later by mobile too). Route handlers stay thin: they authenticate, validate with pure functions, and call a repository module (`src/lib/events-repo.ts`) that holds every Supabase query, so route tests mock the repository instead of query chains. Two client pages render the list and the detail.

**Tech Stack:** Next.js (this repo's version: read `node_modules/next/dist/docs/01-app` before writing route or page code; route `params` is a Promise as in `src/app/api/teams/[id]/invite/route.ts`), Supabase JS, Tailwind, lucide-react, vitest (node env, `src/**/*.test.ts`).

Spec: `docs/superpowers/specs/2026-10-16-event-expense-split-design.md`.

Commit only when the user asks; each task ends with the commit message to use then. Stage by explicit path, sign with `-S`.

---

## File map

- Modify `supabase-schema.sql`: five tables, RLS enabled, no policies.
- Modify `shared/types.ts`: event types. Create `shared/split.ts`; shim `src/lib/split.ts`; test `src/lib/split.test.ts`.
- Create `src/lib/events-repo.ts`: all event queries (not unit-tested; exercised in the manual check).
- Create `src/lib/events-api.ts`: `withParticipant` helper shared by routes; test `src/lib/events-api.test.ts`.
- Create routes: `src/app/api/events/route.ts`, `src/app/api/events/[id]/route.ts`, `.../[id]/participants/route.ts`, `.../[id]/participants/[pid]/route.ts`, `.../[id]/expenses/route.ts`, `.../[id]/expenses/[eid]/route.ts`, `.../[id]/settlements/route.ts`, `.../[id]/settlements/[sid]/route.ts`, each with a `route.test.ts` for the first three files listed in Task 6–9.
- Modify `shared/i18n.ts`: event strings.
- Create `src/app/events/page.tsx`, `src/app/events/[id]/page.tsx`, `src/components/events/ExpenseForm.tsx`, `src/components/events/SettleUp.tsx`. Modify nav in `src/app/dashboard/page.tsx` and `src/app/economy/page.tsx`.

---

### Task 1: Schema

**Files:** Modify `supabase-schema.sql` (append at the end).

- [ ] **Step 1: Append**

```sql
-- Shared event expense splitting. RLS on with no policies: only the server's
-- service-role client may touch these tables, never the public anon key.
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  name text not null check (length(trim(name)) > 0),
  event_date date,
  created_by uuid not null references users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz default now()
);

create table if not exists event_participants (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  check ((user_id is null) <> (display_name is null)),
  check (display_name is null or length(trim(display_name)) > 0)
);
create unique index if not exists event_participants_event_user
  on event_participants (event_id, user_id) where user_id is not null;

create table if not exists event_expenses (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references events(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  paid_by uuid not null references event_participants(id),
  spent_on date not null default current_date,
  created_by uuid not null references users(id),
  created_at timestamptz default now()
);

create table if not exists event_expense_shares (
  expense_id uuid not null references event_expenses(id) on delete cascade,
  participant_id uuid not null references event_participants(id),
  amount_minor bigint not null check (amount_minor >= 0),
  primary key (expense_id, participant_id)
);

create table if not exists event_settlements (
  id uuid default gen_random_uuid() primary key,
  event_id uuid not null references events(id) on delete cascade,
  from_participant uuid not null references event_participants(id),
  to_participant uuid not null references event_participants(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  created_by uuid not null references users(id),
  created_at timestamptz default now(),
  check (from_participant <> to_participant)
);

alter table events enable row level security;
alter table event_participants enable row level security;
alter table event_expenses enable row level security;
alter table event_expense_shares enable row level security;
alter table event_settlements enable row level security;
```

Note: `event_participants` has no `on delete cascade` from expenses/shares/settlements on purpose; the API refuses to delete a referenced participant (409), and the FK backs that up.

- [ ] **Step 2: Commit** — `git add supabase-schema.sql` then `git commit -S -m "feat(db): add event expense splitting tables"`. The owner runs this SQL in the Supabase SQL editor before the deploy (Task 11).

---

### Task 2: Types and split math

**Files:** Modify `shared/types.ts` (append). Create `shared/split.ts`, `src/lib/split.ts`. Test `src/lib/split.test.ts`.

- [ ] **Step 1: Types** — append to `shared/types.ts`:

```ts
export type EventStatus = "open" | "closed";

export interface SplitEvent {
  id: string;
  name: string;
  event_date: string | null;
  created_by: string;
  status: EventStatus;
  created_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  user_id: string | null;
  display_name: string | null;
  created_at: string;
  user?: Pick<User, "id" | "name" | "email" | "color"> | null;
}

export interface EventExpenseShare {
  participant_id: string;
  amount_minor: number;
}

export interface EventExpense {
  id: string;
  event_id: string;
  description: string;
  amount_minor: number;
  currency: string;
  paid_by: string;
  spent_on: string;
  created_by: string;
  created_at: string;
  shares: EventExpenseShare[];
}

export interface EventSettlement {
  id: string;
  event_id: string;
  from_participant: string;
  to_participant: string;
  amount_minor: number;
  currency: string;
  created_by: string;
  created_at: string;
}

export interface EventDetail extends SplitEvent {
  participants: EventParticipant[];
  expenses: EventExpense[];
  settlements: EventSettlement[];
}

// GET /api/events row: the caller's own net per currency (positive = owed to them).
export interface EventSummary extends SplitEvent {
  my_balance: Record<string, number>;
}

export type ExpenseSplitInput =
  | { kind: "equal"; participant_ids: string[] }
  | { kind: "exact"; shares: EventExpenseShare[] };

export interface ExpenseInput {
  description: string;
  amount_minor: number;
  currency: string;
  paid_by: string;
  spent_on: string;
  split: ExpenseSplitInput;
}
```

- [ ] **Step 2: Failing tests** `src/lib/split.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { balances, buildShares, participantLabel, splitEqually, suggestTransfers } from "./split";
import type { EventExpense, EventParticipant, EventSettlement } from "@/types";

const exp = (paid_by: string, amount_minor: number, currency: string, shares: [string, number][]): EventExpense => ({
  id: `${paid_by}-${amount_minor}-${currency}`,
  event_id: "e",
  description: "x",
  amount_minor,
  currency,
  paid_by,
  spent_on: "2026-10-16",
  created_by: "u",
  created_at: "",
  shares: shares.map(([participant_id, amount]) => ({ participant_id, amount_minor: amount })),
});

const settle = (from: string, to: string, amount_minor: number, currency: string): EventSettlement => ({
  id: `${from}-${to}`,
  event_id: "e",
  from_participant: from,
  to_participant: to,
  amount_minor,
  currency,
  created_by: "u",
  created_at: "",
});

describe("splitEqually", () => {
  it("gives the leftover minor units to the first participants", () => {
    expect(splitEqually(10000, ["a", "b", "c"])).toEqual([
      { participant_id: "a", amount_minor: 3334 },
      { participant_id: "b", amount_minor: 3333 },
      { participant_id: "c", amount_minor: 3333 },
    ]);
  });

  it("splits evenly when it divides", () => {
    expect(splitEqually(900, ["a", "b", "c"]).map((s) => s.amount_minor)).toEqual([300, 300, 300]);
  });
});

describe("buildShares", () => {
  const ids = ["a", "b", "c"];

  it("orders an equal split by event participant order, not by request order", () => {
    const r = buildShares(100, { kind: "equal", participant_ids: ["c", "a"] }, ids);
    expect(r).toEqual({ ok: true, shares: [{ participant_id: "a", amount_minor: 50 }, { participant_id: "c", amount_minor: 50 }] });
  });

  it("rejects an empty or foreign or duplicate equal split", () => {
    expect(buildShares(100, { kind: "equal", participant_ids: [] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "equal", participant_ids: ["z"] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "equal", participant_ids: ["a", "a"] }, ids).ok).toBe(false);
  });

  it("accepts exact shares that add up and drops zero shares", () => {
    const r = buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 100 }, { participant_id: "b", amount_minor: 0 }] }, ids);
    expect(r).toEqual({ ok: true, shares: [{ participant_id: "a", amount_minor: 100 }] });
  });

  it("rejects exact shares that do not add up, are negative, fractional or foreign", () => {
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 90 }] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 110 }, { participant_id: "b", amount_minor: -10 }] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 99.5 }, { participant_id: "b", amount_minor: 0.5 }] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "z", amount_minor: 100 }] }, ids).ok).toBe(false);
  });
});

describe("balances", () => {
  it("is paid minus share, per currency", () => {
    const b = balances(
      [exp("a", 300, "TRY", [["a", 100], ["b", 100], ["c", 100]]), exp("b", 20, "EUR", [["a", 10], ["b", 10]])],
      []
    );
    expect(b).toEqual({ TRY: { a: 200, b: -100, c: -100 }, EUR: { a: -10, b: 10 } });
  });

  it("moves a recorded payment toward zero", () => {
    const b = balances([exp("a", 300, "TRY", [["a", 100], ["b", 100], ["c", 100]])], [settle("b", "a", 60, "TRY")]);
    expect(b.TRY).toEqual({ a: 140, b: -40, c: -100 });
  });
});

describe("suggestTransfers", () => {
  it("matches the largest debtor with the largest creditor", () => {
    expect(suggestTransfers({ TRY: { a: 200, b: -100, c: -100 } })).toEqual([
      { from: "b", to: "a", amount_minor: 100, currency: "TRY" },
      { from: "c", to: "a", amount_minor: 100, currency: "TRY" },
    ]);
  });

  it("handles several creditors and keeps currencies apart", () => {
    const t = suggestTransfers({ TRY: { a: 150, b: 50, c: -200 }, EUR: { a: -10, b: 10 } });
    expect(t).toEqual([
      { from: "a", to: "b", amount_minor: 10, currency: "EUR" },
      { from: "c", to: "a", amount_minor: 150, currency: "TRY" },
      { from: "c", to: "b", amount_minor: 50, currency: "TRY" },
    ]);
  });

  it("is empty when everyone is even", () => {
    expect(suggestTransfers({ TRY: { a: 0, b: 0 } })).toEqual([]);
  });
});

describe("participantLabel", () => {
  it("prefers the user's name, then email, then the display name", () => {
    const base = { id: "p", event_id: "e", created_at: "" } as const;
    expect(participantLabel({ ...base, user_id: "u", display_name: null, user: { id: "u", name: "Ali", email: "a@x", color: null } } as EventParticipant)).toBe("Ali");
    expect(participantLabel({ ...base, user_id: "u", display_name: null, user: { id: "u", name: null, email: "a@x", color: null } } as EventParticipant)).toBe("a@x");
    expect(participantLabel({ ...base, user_id: null, display_name: "Can" } as EventParticipant)).toBe("Can");
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run src/lib/split.test.ts` → cannot resolve `./split`.

- [ ] **Step 4: Implement** `shared/split.ts`:

```ts
import type { EventExpense, EventExpenseShare, EventParticipant, EventSettlement, ExpenseSplitInput } from "./types";

// currency -> participant id -> net minor units (positive = owed money).
export type Balances = Record<string, Record<string, number>>;

export interface Transfer {
  from: string;
  to: string;
  amount_minor: number;
  currency: string;
}

export function splitEqually(totalMinor: number, participantIds: string[]): EventExpenseShare[] {
  const base = Math.floor(totalMinor / participantIds.length);
  const extra = totalMinor - base * participantIds.length;
  return participantIds.map((participant_id, i) => ({ participant_id, amount_minor: base + (i < extra ? 1 : 0) }));
}

// Validates a split against the event's participants (in join order) and returns the
// stored shares. Equal shares follow join order so the leftover cent is deterministic.
export function buildShares(
  amountMinor: number,
  split: ExpenseSplitInput,
  eventParticipantIds: string[]
): { ok: true; shares: EventExpenseShare[] } | { ok: false; error: string } {
  const known = new Set(eventParticipantIds);
  if (split.kind === "equal") {
    const chosen = new Set(split.participant_ids);
    if (chosen.size === 0 || chosen.size !== split.participant_ids.length) return { ok: false, error: "Invalid participants" };
    if ([...chosen].some((id) => !known.has(id))) return { ok: false, error: "Invalid participants" };
    return { ok: true, shares: splitEqually(amountMinor, eventParticipantIds.filter((id) => chosen.has(id))) };
  }
  const ids = split.shares.map((s) => s.participant_id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) return { ok: false, error: "Invalid participants" };
  if (split.shares.some((s) => !Number.isInteger(s.amount_minor) || s.amount_minor < 0)) return { ok: false, error: "Invalid share amount" };
  if (split.shares.reduce((sum, s) => sum + s.amount_minor, 0) !== amountMinor) return { ok: false, error: "Shares must add up to the amount" };
  const shares = split.shares.filter((s) => s.amount_minor > 0);
  if (shares.length === 0) return { ok: false, error: "Invalid participants" };
  return { ok: true, shares };
}

export function balances(expenses: EventExpense[], settlements: EventSettlement[]): Balances {
  const out: Balances = {};
  const add = (currency: string, id: string, delta: number) => {
    const row = (out[currency] ??= {});
    row[id] = (row[id] ?? 0) + delta;
  };
  for (const e of expenses) {
    add(e.currency, e.paid_by, e.amount_minor);
    for (const s of e.shares) add(e.currency, s.participant_id, -s.amount_minor);
  }
  for (const s of settlements) {
    add(s.currency, s.from_participant, s.amount_minor);
    add(s.currency, s.to_participant, -s.amount_minor);
  }
  return out;
}

export function suggestTransfers(b: Balances): Transfer[] {
  const transfers: Transfer[] = [];
  for (const currency of Object.keys(b).sort()) {
    const byAmount = (x: [string, number], y: [string, number]) => y[1] - x[1] || x[0].localeCompare(y[0]);
    const creditors = Object.entries(b[currency]).filter(([, v]) => v > 0).sort(byAmount);
    const debtors = Object.entries(b[currency]).filter(([, v]) => v < 0).map(([id, v]) => [id, -v] as [string, number]).sort(byAmount);
    while (creditors.length && debtors.length) {
      const [c, d] = [creditors[0], debtors[0]];
      const amount = Math.min(c[1], d[1]);
      transfers.push({ from: d[0], to: c[0], amount_minor: amount, currency });
      c[1] -= amount;
      d[1] -= amount;
      if (c[1] === 0) creditors.shift();
      if (d[1] === 0) debtors.shift();
      creditors.sort(byAmount);
      debtors.sort(byAmount);
    }
  }
  return transfers;
}

export function participantLabel(p: EventParticipant): string {
  return p.user?.name ?? p.user?.email ?? p.display_name ?? "?";
}

export function formatMinor(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
```

`src/lib/split.ts`:

```ts
export * from "../../shared/split";
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run src/lib/split.test.ts`, then `npx vitest run` and `npx tsc --noEmit` at the root.

- [ ] **Step 6: Commit** — `git add shared/types.ts shared/split.ts src/lib/split.ts src/lib/split.test.ts` then `git commit -S -m "feat(shared): add event expense split math"`.

---

### Task 3: Repository

**Files:** Create `src/lib/events-repo.ts`.

Every Supabase query for events lives here, so routes stay testable by mocking this module. Read `src/lib/supabase.ts` and `src/app/api/teams/route.ts` first for the client and error conventions.

- [ ] **Step 1: Implement**

```ts
import { supabaseAdmin } from "@/lib/supabase";
import type {
  EventDetail,
  EventExpenseShare,
  EventParticipant,
  EventSettlement,
  EventStatus,
  ExpenseInput,
  SplitEvent,
} from "@/types";

type Db = ReturnType<typeof supabaseAdmin>;

function fail(context: string, error: { message: string }): never {
  console.error(`events-repo ${context}:`, error);
  throw new Error(error.message);
}

const PARTICIPANT_COLUMNS = "id, event_id, user_id, display_name, created_at, user:users(id, name, email, color)";

// The caller's own participant row in an event, or null when they are not in it.
export async function findMyParticipant(db: Db, eventId: string, userId: string): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("event_participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("findMyParticipant", error);
  return data;
}

export async function getEvent(db: Db, eventId: string): Promise<SplitEvent | null> {
  const { data, error } = await db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) fail("getEvent", error);
  return data;
}

export async function listParticipants(db: Db, eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await db
    .from("event_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at")
    .order("id");
  if (error) fail("listParticipants", error);
  return (data ?? []) as unknown as EventParticipant[];
}

export async function loadEventDetail(db: Db, eventId: string): Promise<EventDetail | null> {
  const event = await getEvent(db, eventId);
  if (!event) return null;
  const [participants, expenses, settlements] = await Promise.all([
    listParticipants(db, eventId),
    db
      .from("event_expenses")
      .select("*, shares:event_expense_shares(participant_id, amount_minor)")
      .eq("event_id", eventId)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
    db.from("event_settlements").select("*").eq("event_id", eventId).order("created_at"),
  ]);
  if (expenses.error) fail("loadEventDetail expenses", expenses.error);
  if (settlements.error) fail("loadEventDetail settlements", settlements.error);
  return { ...event, participants, expenses: expenses.data ?? [], settlements: settlements.data ?? [] };
}

// Events the user takes part in, newest first.
export async function listMyEventIds(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db.from("event_participants").select("event_id").eq("user_id", userId);
  if (error) fail("listMyEventIds", error);
  return (data ?? []).map((r: { event_id: string }) => r.event_id);
}

export async function createEvent(db: Db, userId: string, name: string, eventDate: string | null): Promise<SplitEvent> {
  const { data, error } = await db
    .from("events")
    .insert({ name, event_date: eventDate, created_by: userId })
    .select()
    .single();
  if (error) fail("createEvent", error);
  const { error: pErr } = await db.from("event_participants").insert({ event_id: data.id, user_id: userId });
  if (pErr) {
    await db.from("events").delete().eq("id", data.id);
    fail("createEvent participant", pErr);
  }
  return data;
}

export async function updateEvent(
  db: Db,
  eventId: string,
  patch: Partial<{ name: string; event_date: string | null; status: EventStatus }>
): Promise<void> {
  const { error } = await db.from("events").update(patch).eq("id", eventId);
  if (error) fail("updateEvent", error);
}

export async function deleteEvent(db: Db, eventId: string): Promise<void> {
  const { error } = await db.from("events").delete().eq("id", eventId);
  if (error) fail("deleteEvent", error);
}

export async function findUserByEmail(db: Db, email: string): Promise<{ id: string } | null> {
  const { data, error } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (error) fail("findUserByEmail", error);
  return data;
}

// True when the two users are members of at least one common team.
export async function shareATeam(db: Db, a: string, b: string): Promise<boolean> {
  const { data, error } = await db.from("team_members").select("team_id, user_id").in("user_id", [a, b]);
  if (error) fail("shareATeam", error);
  const teamsOf = (u: string) => new Set((data ?? []).filter((r) => r.user_id === u).map((r) => r.team_id));
  const mine = teamsOf(a);
  return [...teamsOf(b)].some((t) => mine.has(t));
}

// Returns null when the user is already in the event (unique index).
export async function addParticipant(
  db: Db,
  eventId: string,
  who: { user_id: string } | { display_name: string }
): Promise<EventParticipant | null> {
  const { data, error } = await db
    .from("event_participants")
    .insert({ event_id: eventId, ...who })
    .select(PARTICIPANT_COLUMNS)
    .single();
  if (error?.code === "23505") return null;
  if (error) fail("addParticipant", error);
  return data as unknown as EventParticipant;
}

export async function participantIsReferenced(db: Db, participantId: string): Promise<boolean> {
  const checks = await Promise.all([
    db.from("event_expenses").select("id", { count: "exact", head: true }).eq("paid_by", participantId),
    db.from("event_expense_shares").select("expense_id", { count: "exact", head: true }).eq("participant_id", participantId),
    db.from("event_settlements").select("id", { count: "exact", head: true }).or(`from_participant.eq.${participantId},to_participant.eq.${participantId}`),
  ]);
  for (const c of checks) if (c.error) fail("participantIsReferenced", c.error);
  return checks.some((c) => (c.count ?? 0) > 0);
}

export async function deleteParticipant(db: Db, participantId: string): Promise<void> {
  const { error } = await db.from("event_participants").delete().eq("id", participantId);
  if (error) fail("deleteParticipant", error);
}

export async function insertExpense(
  db: Db,
  eventId: string,
  userId: string,
  input: Omit<ExpenseInput, "split">,
  shares: EventExpenseShare[]
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("event_expenses")
    .insert({ event_id: eventId, created_by: userId, ...input })
    .select("id")
    .single();
  if (error) fail("insertExpense", error);
  const { error: sErr } = await db.from("event_expense_shares").insert(shares.map((s) => ({ expense_id: data.id, ...s })));
  if (sErr) {
    await db.from("event_expenses").delete().eq("id", data.id);
    fail("insertExpense shares", sErr);
  }
  return data;
}

export async function replaceExpense(
  db: Db,
  expenseId: string,
  input: Omit<ExpenseInput, "split">,
  shares: EventExpenseShare[]
): Promise<void> {
  const { error } = await db.from("event_expenses").update(input).eq("id", expenseId);
  if (error) fail("replaceExpense", error);
  const { error: dErr } = await db.from("event_expense_shares").delete().eq("expense_id", expenseId);
  if (dErr) fail("replaceExpense delete shares", dErr);
  const { error: sErr } = await db.from("event_expense_shares").insert(shares.map((s) => ({ expense_id: expenseId, ...s })));
  if (sErr) fail("replaceExpense shares", sErr);
}

export async function expenseEventId(db: Db, expenseId: string): Promise<string | null> {
  const { data, error } = await db.from("event_expenses").select("event_id").eq("id", expenseId).maybeSingle();
  if (error) fail("expenseEventId", error);
  return data?.event_id ?? null;
}

export async function deleteExpense(db: Db, expenseId: string): Promise<void> {
  const { error } = await db.from("event_expenses").delete().eq("id", expenseId);
  if (error) fail("deleteExpense", error);
}

export async function insertSettlement(
  db: Db,
  eventId: string,
  userId: string,
  s: Pick<EventSettlement, "from_participant" | "to_participant" | "amount_minor" | "currency">
): Promise<EventSettlement> {
  const { data, error } = await db
    .from("event_settlements")
    .insert({ event_id: eventId, created_by: userId, ...s })
    .select()
    .single();
  if (error) fail("insertSettlement", error);
  return data;
}

export async function settlementEventId(db: Db, settlementId: string): Promise<string | null> {
  const { data, error } = await db.from("event_settlements").select("event_id").eq("id", settlementId).maybeSingle();
  if (error) fail("settlementEventId", error);
  return data?.event_id ?? null;
}

export async function deleteSettlement(db: Db, settlementId: string): Promise<void> {
  const { error } = await db.from("event_settlements").delete().eq("id", settlementId);
  if (error) fail("deleteSettlement", error);
}
```

The expense and share writes are two statements, not one transaction; `insertExpense` deletes the expense if the shares insert fails, and `replaceExpense` is accepted as best-effort (a failure mid-way surfaces as 500 and the user retries the edit). If Supabase typing rejects a `.select(...)` result shape, cast through `unknown` as done for participants.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` at the root.

- [ ] **Step 3: Commit** — `git add src/lib/events-repo.ts` then `git commit -S -m "feat(api): add the event expense repository"`.

---

### Task 4: Route helper

**Files:** Create `src/lib/events-api.ts`. Test `src/lib/events-api.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({ findMyParticipant: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { findMyParticipant } from "@/lib/events-repo";
import { withParticipant, parseAmountMinor, isCurrency } from "./events-api";

const req = new Request("http://localhost/api/events/e1");

beforeEach(() => vi.clearAllMocks());

describe("withParticipant", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await withParticipant(req, "e1", async () => new Response("ok"));
    expect(res.status).toBe(401);
  });

  it("404s when the user is not in the event", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockResolvedValue(null);
    const res = await withParticipant(req, "e1", async () => new Response("ok"));
    expect(res.status).toBe(404);
  });

  it("runs the handler with the user and their participant", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockResolvedValue({ id: "p1" });
    const handler = vi.fn(async () => new Response("ok"));
    await withParticipant(req, "e1", handler);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ user: { id: "u1", email: "a@x" }, me: { id: "p1" } }));
  });

  it("turns a thrown error into a 500", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withParticipant(req, "e1", async () => new Response("ok"));
    expect(res.status).toBe(500);
  });
});

describe("validators", () => {
  it("accepts positive integer minor amounts only", () => {
    expect(parseAmountMinor(1)).toBe(1);
    for (const bad of [0, -1, 1.5, "100", null, Number.MAX_SAFE_INTEGER + 1]) expect(parseAmountMinor(bad)).toBeNull();
  });

  it("accepts the four app currencies", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("JPY")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/events-api.test.ts`.

- [ ] **Step 3: Implement** `src/lib/events-api.ts`:

```ts
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { findMyParticipant } from "@/lib/events-repo";
import { ALLOWED_CURRENCIES } from "@/lib/payments";

export interface ParticipantContext {
  db: ReturnType<typeof supabaseAdmin>;
  user: SessionUser;
  me: { id: string };
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// Auth + membership for every /api/events/[id]/* route. Not a participant -> 404, so an
// outsider cannot tell whether an event id exists.
export async function withParticipant(
  req: Request,
  eventId: string,
  handler: (ctx: ParticipantContext) => Promise<Response>
): Promise<Response> {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "Unauthorized");
  try {
    const db = supabaseAdmin();
    const me = await findMyParticipant(db, eventId, user.id);
    if (!me) return jsonError(404, "Not found");
    return await handler({ db, user, me });
  } catch (e) {
    console.error(`events route ${eventId}:`, e);
    return jsonError(500, "Internal error");
  }
}

export function parseAmountMinor(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function isCurrency(value: unknown): value is string {
  return typeof value === "string" && ALLOWED_CURRENCIES.includes(value);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
```

Check that `src/lib/payments.ts` re-exports `ALLOWED_CURRENCIES` from `shared/payments.ts`; if not, import from `"../../shared/payments"`.

- [ ] **Step 4: Run, expect PASS**, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add src/lib/events-api.ts src/lib/events-api.test.ts` then `git commit -S -m "feat(api): add the event route membership helper"`.

---

### Task 5: `GET/POST /api/events`

**Files:** Create `src/app/api/events/route.ts`, test `src/app/api/events/route.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  listMyEventIds: vi.fn(),
  loadEventDetail: vi.fn(),
  createEvent: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { createEvent, listMyEventIds, loadEventDetail } from "@/lib/events-repo";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
});

describe("GET /api/events", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/events") as never)).status).toBe(401);
  });

  it("returns my events with my per-currency balance", async () => {
    vi.mocked(listMyEventIds).mockResolvedValue(["e1"]);
    vi.mocked(loadEventDetail).mockResolvedValue({
      id: "e1", name: "Trip", event_date: null, created_by: "u1", status: "open", created_at: "2026-10-01",
      participants: [
        { id: "p1", event_id: "e1", user_id: "u1", display_name: null, created_at: "" },
        { id: "p2", event_id: "e1", user_id: null, display_name: "Can", created_at: "" },
      ],
      expenses: [{ id: "x", event_id: "e1", description: "d", amount_minor: 100, currency: "TRY", paid_by: "p1", spent_on: "", created_by: "u1", created_at: "", shares: [{ participant_id: "p1", amount_minor: 50 }, { participant_id: "p2", amount_minor: 50 }] }],
      settlements: [],
    });
    const body = await (await GET(new Request("http://localhost/api/events") as never)).json();
    expect(body).toEqual([expect.objectContaining({ id: "e1", my_balance: { TRY: 50 } })]);
    expect(body[0].participants).toBeUndefined();
  });
});

describe("POST /api/events", () => {
  it("400s on a blank name or a bad date", async () => {
    for (const b of [{ name: "  " }, { name: 5 }, { name: "Trip", event_date: "tomorrow" }]) {
      expect((await POST(post(b) as never)).status).toBe(400);
    }
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("creates the event with a trimmed name", async () => {
    vi.mocked(createEvent).mockResolvedValue({ id: "e1" } as never);
    const res = await POST(post({ name: " Trip ", event_date: "2026-10-16" }) as never);
    expect(res.status).toBe(201);
    expect(createEvent).toHaveBeenCalledWith({}, "u1", "Trip", "2026-10-16");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/app/api/events/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { createEvent, listMyEventIds, loadEventDetail } from "@/lib/events-repo";
import { isIsoDate, jsonError, readJson } from "@/lib/events-api";
import { balances } from "@/lib/split";
import type { EventSummary } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "Unauthorized");
  try {
    const db = supabaseAdmin();
    const ids = await listMyEventIds(db, user.id);
    const details = (await Promise.all(ids.map((id) => loadEventDetail(db, id)))).filter((d) => d !== null);
    const summaries: EventSummary[] = details.map(({ participants, expenses, settlements, ...event }) => {
      const meId = participants.find((p) => p.user_id === user.id)?.id;
      const my_balance: Record<string, number> = {};
      for (const [currency, row] of Object.entries(balances(expenses, settlements))) {
        if (meId && row[meId]) my_balance[currency] = row[meId];
      }
      return { ...event, my_balance };
    });
    summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json(summaries);
  } catch (e) {
    console.error("GET /api/events error:", e);
    return jsonError(500, "Internal error");
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return jsonError(401, "Unauthorized");
  const body = await readJson(req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const eventDate = body?.event_date ?? null;
  if (!name) return jsonError(400, "Event name is required");
  if (eventDate !== null && !isIsoDate(eventDate)) return jsonError(400, "Invalid date");
  try {
    const event = await createEvent(supabaseAdmin(), user.id, name, eventDate);
    return NextResponse.json(event, { status: 201 });
  } catch (e) {
    console.error("POST /api/events error:", e);
    return jsonError(500, "Internal error");
  }
}
```

`GET` loads each event in full to compute balances; that is N+1 queries per event list, acceptable for a personal app with a handful of events. Note it in the PR.

- [ ] **Step 4: Run, expect PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add src/app/api/events/route.ts src/app/api/events/route.test.ts` then `git commit -S -m "feat(api): list and create events"`.

---

### Task 6: `GET/PATCH/DELETE /api/events/[id]`

**Files:** Create `src/app/api/events/[id]/route.ts`, test `src/app/api/events/[id]/route.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  loadEventDetail: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { deleteEvent, findMyParticipant, getEvent, updateEvent } from "@/lib/events-repo";
import { DELETE, PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "e1" }) };
const patch = (body: unknown) => new Request("http://localhost/api/events/e1", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u2", email: "b@x" });
  vi.mocked(findMyParticipant).mockResolvedValue({ id: "p2" });
  vi.mocked(getEvent).mockResolvedValue({ id: "e1", created_by: "u1" } as never);
});

describe("PATCH /api/events/[id]", () => {
  it("403s for a participant who did not create the event", async () => {
    expect((await PATCH(patch({ status: "closed" }) as never, ctx)).status).toBe(403);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("lets the creator close the event", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await PATCH(patch({ status: "closed" }) as never, ctx)).status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith({}, "e1", { status: "closed" });
  });

  it("400s on an invalid status or blank name", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await PATCH(patch({ status: "done" }) as never, ctx)).status).toBe(400);
    expect((await PATCH(patch({ name: " " }) as never, ctx)).status).toBe(400);
  });
});

describe("DELETE /api/events/[id]", () => {
  it("403s for a non-creator and deletes for the creator", async () => {
    const del = () => new Request("http://localhost/api/events/e1", { method: "DELETE" });
    expect((await DELETE(del() as never, ctx)).status).toBe(403);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await DELETE(del() as never, ctx)).status).toBe(204);
    expect(deleteEvent).toHaveBeenCalledWith({}, "e1");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/app/api/events/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, getEvent, loadEventDetail, updateEvent } from "@/lib/events-repo";
import { isIsoDate, jsonError, readJson, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db }) => {
    const detail = await loadEventDetail(db, id);
    return detail ? NextResponse.json(detail) : jsonError(404, "Not found");
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user }) => {
    const event = await getEvent(db, id);
    if (!event) return jsonError(404, "Not found");
    if (event.created_by !== user.id) return jsonError(403, "Only the creator can change the event");
    const body = await readJson(req);
    if (!body) return jsonError(400, "Invalid body");
    const patch: { name?: string; event_date?: string | null; status?: "open" | "closed" } = {};
    if ("name" in body) {
      if (typeof body.name !== "string" || !body.name.trim()) return jsonError(400, "Event name is required");
      patch.name = body.name.trim();
    }
    if ("event_date" in body) {
      if (body.event_date !== null && !isIsoDate(body.event_date)) return jsonError(400, "Invalid date");
      patch.event_date = body.event_date as string | null;
    }
    if ("status" in body) {
      if (body.status !== "open" && body.status !== "closed") return jsonError(400, "Invalid status");
      patch.status = body.status;
    }
    await updateEvent(db, id, patch);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user }) => {
    const event = await getEvent(db, id);
    if (!event) return jsonError(404, "Not found");
    if (event.created_by !== user.id) return jsonError(403, "Only the creator can delete the event");
    await deleteEvent(db, id);
    return new NextResponse(null, { status: 204 });
  });
}
```

- [ ] **Step 4: Run, expect PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add "src/app/api/events/[id]/route.ts" "src/app/api/events/[id]/route.test.ts"` then `git commit -S -m "feat(api): read, update and delete an event"`.

---

### Task 7: Participants

**Files:** Create `src/app/api/events/[id]/participants/route.ts`, `src/app/api/events/[id]/participants/[pid]/route.ts`, test `src/app/api/events/[id]/participants/route.test.ts`.

- [ ] **Step 1: Failing tests** (cover both files in one test file):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  findUserByEmail: vi.fn(),
  shareATeam: vi.fn(),
  addParticipant: vi.fn(),
  getEvent: vi.fn(),
  listParticipants: vi.fn(),
  participantIsReferenced: vi.fn(),
  deleteParticipant: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import * as repo from "@/lib/events-repo";
import { POST } from "./route";
import { DELETE } from "./[pid]/route";

const ctx = { params: Promise.resolve({ id: "e1" }) };
const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  vi.mocked(repo.findMyParticipant).mockResolvedValue({ id: "p1" });
  vi.mocked(repo.addParticipant).mockResolvedValue({ id: "pN" } as never);
});

describe("POST participants", () => {
  it("adds a by-name participant", async () => {
    expect((await POST(post({ display_name: " Can " }) as never, ctx)).status).toBe(201);
    expect(repo.addParticipant).toHaveBeenCalledWith({}, "e1", { display_name: "Can" });
  });

  it("adds a team mate by user id only when they share a team", async () => {
    vi.mocked(repo.shareATeam).mockResolvedValue(false);
    expect((await POST(post({ user_id: "u9" }) as never, ctx)).status).toBe(403);
    vi.mocked(repo.shareATeam).mockResolvedValue(true);
    expect((await POST(post({ user_id: "u9" }) as never, ctx)).status).toBe(201);
    expect(repo.addParticipant).toHaveBeenLastCalledWith({}, "e1", { user_id: "u9" });
  });

  it("adds a registered user by email and 404s an unknown email", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(null);
    expect((await POST(post({ email: "x@y" }) as never, ctx)).status).toBe(404);
    vi.mocked(repo.findUserByEmail).mockResolvedValue({ id: "u7" });
    expect((await POST(post({ email: " x@y " }) as never, ctx)).status).toBe(201);
    expect(repo.findUserByEmail).toHaveBeenLastCalledWith({}, "x@y");
  });

  it("409s when the user is already in the event", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue({ id: "u7" });
    vi.mocked(repo.addParticipant).mockResolvedValue(null);
    expect((await POST(post({ email: "x@y" }) as never, ctx)).status).toBe(409);
  });

  it("400s on an empty body", async () => {
    expect((await POST(post({}) as never, ctx)).status).toBe(400);
  });
});

describe("DELETE participant", () => {
  const delCtx = { params: Promise.resolve({ id: "e1", pid: "p5" }) };
  const del = () => new Request("http://localhost/x", { method: "DELETE" });

  beforeEach(() => {
    vi.mocked(repo.getEvent).mockResolvedValue({ id: "e1", created_by: "u1" } as never);
    vi.mocked(repo.listParticipants).mockResolvedValue([
      { id: "p1", user_id: "u1" },
      { id: "p5", user_id: null },
    ] as never);
  });

  it("404s a participant of another event", async () => {
    vi.mocked(repo.listParticipants).mockResolvedValue([{ id: "p1", user_id: "u1" }] as never);
    expect((await DELETE(del() as never, delCtx)).status).toBe(404);
  });

  it("409s when the participant is in an expense or payment", async () => {
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(true);
    expect((await DELETE(del() as never, delCtx)).status).toBe(409);
    expect(repo.deleteParticipant).not.toHaveBeenCalled();
  });

  it("refuses to remove the creator", async () => {
    const creatorCtx = { params: Promise.resolve({ id: "e1", pid: "p1" }) };
    expect((await DELETE(del() as never, creatorCtx)).status).toBe(409);
  });

  it("deletes an unreferenced participant", async () => {
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(false);
    expect((await DELETE(del() as never, delCtx)).status).toBe(204);
    expect(repo.deleteParticipant).toHaveBeenCalledWith({}, "p5");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/app/api/events/[id]/participants/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { addParticipant, findUserByEmail, shareATeam } from "@/lib/events-repo";
import { jsonError, readJson, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user }) => {
    const body = await readJson(req);
    let who: { user_id: string } | { display_name: string };
    if (typeof body?.display_name === "string" && body.display_name.trim()) {
      who = { display_name: body.display_name.trim() };
    } else if (typeof body?.user_id === "string" && body.user_id) {
      if (!(await shareATeam(db, user.id, body.user_id))) return jsonError(403, "Not a team mate");
      who = { user_id: body.user_id };
    } else if (typeof body?.email === "string" && body.email.trim()) {
      const found = await findUserByEmail(db, body.email.trim());
      if (!found) return jsonError(404, "User not found");
      who = { user_id: found.id };
    } else {
      return jsonError(400, "A name, team mate or email is required");
    }
    const participant = await addParticipant(db, id, who);
    return participant ? NextResponse.json(participant, { status: 201 }) : jsonError(409, "Already in the event");
  });
}
```

`src/app/api/events/[id]/participants/[pid]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteParticipant, getEvent, listParticipants, participantIsReferenced } from "@/lib/events-repo";
import { jsonError, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  return withParticipant(req, id, async ({ db }) => {
    const [event, participants] = await Promise.all([getEvent(db, id), listParticipants(db, id)]);
    const target = participants.find((p) => p.id === pid);
    if (!event || !target) return jsonError(404, "Not found");
    if (target.user_id === event.created_by) return jsonError(409, "The creator cannot be removed");
    if (await participantIsReferenced(db, pid)) return jsonError(409, "Participant has expenses or payments");
    await deleteParticipant(db, pid);
    return new NextResponse(null, { status: 204 });
  });
}
```

- [ ] **Step 4: Run, expect PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — stage the three files explicitly, then `git commit -S -m "feat(api): add and remove event participants"`.

---

### Task 8: Expenses

**Files:** Create `src/app/api/events/[id]/expenses/route.ts`, `src/app/api/events/[id]/expenses/[eid]/route.ts`, `src/lib/expense-input.ts` (+ `src/lib/expense-input.test.ts`), test `src/app/api/events/[id]/expenses/route.test.ts`.

- [ ] **Step 1: Failing tests for input parsing** `src/lib/expense-input.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseExpenseInput } from "./expense-input";

const ids = ["p1", "p2", "p3"];
const valid = {
  description: " Dinner ",
  amount_minor: 300,
  currency: "TRY",
  paid_by: "p1",
  spent_on: "2026-10-16",
  split: { kind: "equal", participant_ids: ["p1", "p2", "p3"] },
};

describe("parseExpenseInput", () => {
  it("returns the row and the computed shares", () => {
    expect(parseExpenseInput(valid, ids)).toEqual({
      ok: true,
      row: { description: "Dinner", amount_minor: 300, currency: "TRY", paid_by: "p1", spent_on: "2026-10-16" },
      shares: [
        { participant_id: "p1", amount_minor: 100 },
        { participant_id: "p2", amount_minor: 100 },
        { participant_id: "p3", amount_minor: 100 },
      ],
    });
  });

  it.each([
    ["blank description", { description: " " }],
    ["zero amount", { amount_minor: 0 }],
    ["fractional amount", { amount_minor: 1.5 }],
    ["unknown currency", { currency: "JPY" }],
    ["payer outside the event", { paid_by: "pX" }],
    ["bad date", { spent_on: "16/10/2026" }],
    ["missing split", { split: null }],
    ["unknown split kind", { split: { kind: "percent" } }],
    ["shares not adding up", { split: { kind: "exact", shares: [{ participant_id: "p1", amount_minor: 10 }] } }],
  ])("rejects %s", (_, override) => {
    expect(parseExpenseInput({ ...valid, ...override }, ids).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/lib/expense-input.ts`:

```ts
import { buildShares } from "@/lib/split";
import { isCurrency, isIsoDate, parseAmountMinor } from "@/lib/events-api";
import type { EventExpenseShare, ExpenseInput, ExpenseSplitInput } from "@/types";

export type ParsedExpense =
  | { ok: true; row: Omit<ExpenseInput, "split">; shares: EventExpenseShare[] }
  | { ok: false; error: string };

function asSplit(value: unknown): ExpenseSplitInput | null {
  const v = value as { kind?: unknown; participant_ids?: unknown; shares?: unknown } | null;
  if (v?.kind === "equal" && Array.isArray(v.participant_ids) && v.participant_ids.every((x) => typeof x === "string")) {
    return { kind: "equal", participant_ids: v.participant_ids };
  }
  if (
    v?.kind === "exact" &&
    Array.isArray(v.shares) &&
    v.shares.every((s) => typeof s?.participant_id === "string" && typeof s?.amount_minor === "number")
  ) {
    return { kind: "exact", shares: v.shares };
  }
  return null;
}

export function parseExpenseInput(body: Record<string, unknown> | null, participantIds: string[]): ParsedExpense {
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) return { ok: false, error: "Description is required" };
  const amount = parseAmountMinor(body?.amount_minor);
  if (amount === null) return { ok: false, error: "Invalid amount" };
  if (!isCurrency(body?.currency)) return { ok: false, error: "Invalid currency" };
  if (typeof body?.paid_by !== "string" || !participantIds.includes(body.paid_by)) return { ok: false, error: "Invalid payer" };
  if (!isIsoDate(body?.spent_on)) return { ok: false, error: "Invalid date" };
  const split = asSplit(body?.split);
  if (!split) return { ok: false, error: "Invalid split" };
  const built = buildShares(amount, split, participantIds);
  if (!built.ok) return built;
  return {
    ok: true,
    row: { description, amount_minor: amount, currency: body.currency as string, paid_by: body.paid_by, spent_on: body.spent_on },
    shares: built.shares,
  };
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/expense-input.test.ts`.

- [ ] **Step 5: Failing route tests** `src/app/api/events/[id]/expenses/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  listParticipants: vi.fn(),
  insertExpense: vi.fn(),
  replaceExpense: vi.fn(),
  expenseEventId: vi.fn(),
  deleteExpense: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import * as repo from "@/lib/events-repo";
import { POST } from "./route";
import { DELETE, PUT } from "./[eid]/route";

const body = {
  description: "Dinner",
  amount_minor: 200,
  currency: "TRY",
  paid_by: "p1",
  spent_on: "2026-10-16",
  split: { kind: "equal", participant_ids: ["p1", "p2"] },
};
const req = (method: string, b?: unknown) => new Request("http://localhost/x", { method, body: b ? JSON.stringify(b) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  vi.mocked(repo.findMyParticipant).mockResolvedValue({ id: "p1" });
  vi.mocked(repo.listParticipants).mockResolvedValue([{ id: "p1" }, { id: "p2" }] as never);
  vi.mocked(repo.insertExpense).mockResolvedValue({ id: "x1" });
});

describe("POST expenses", () => {
  it("stores the expense with computed shares", async () => {
    const res = await POST(req("POST", body) as never, { params: Promise.resolve({ id: "e1" }) });
    expect(res.status).toBe(201);
    expect(repo.insertExpense).toHaveBeenCalledWith(
      {},
      "e1",
      "u1",
      { description: "Dinner", amount_minor: 200, currency: "TRY", paid_by: "p1", spent_on: "2026-10-16" },
      [{ participant_id: "p1", amount_minor: 100 }, { participant_id: "p2", amount_minor: 100 }]
    );
  });

  it("400s an invalid expense", async () => {
    const res = await POST(req("POST", { ...body, paid_by: "p9" }) as never, { params: Promise.resolve({ id: "e1" }) });
    expect(res.status).toBe(400);
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });
});

describe("PUT/DELETE expense", () => {
  const ctx = { params: Promise.resolve({ id: "e1", eid: "x1" }) };

  it("404s an expense that belongs to another event", async () => {
    vi.mocked(repo.expenseEventId).mockResolvedValue("e2");
    expect((await PUT(req("PUT", body) as never, ctx)).status).toBe(404);
    expect((await DELETE(req("DELETE") as never, ctx)).status).toBe(404);
    expect(repo.replaceExpense).not.toHaveBeenCalled();
    expect(repo.deleteExpense).not.toHaveBeenCalled();
  });

  it("replaces and deletes an expense of this event", async () => {
    vi.mocked(repo.expenseEventId).mockResolvedValue("e1");
    expect((await PUT(req("PUT", body) as never, ctx)).status).toBe(200);
    expect(repo.replaceExpense).toHaveBeenCalled();
    expect((await DELETE(req("DELETE") as never, ctx)).status).toBe(204);
    expect(repo.deleteExpense).toHaveBeenCalledWith({}, "x1");
  });
});
```

- [ ] **Step 6: Run, expect FAIL.**

- [ ] **Step 7: Implement** `src/app/api/events/[id]/expenses/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { insertExpense, listParticipants } from "@/lib/events-repo";
import { jsonError, readJson, withParticipant } from "@/lib/events-api";
import { parseExpenseInput } from "@/lib/expense-input";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user }) => {
    const participants = await listParticipants(db, id);
    const parsed = parseExpenseInput(await readJson(req), participants.map((p) => p.id));
    if (!parsed.ok) return jsonError(400, parsed.error);
    const created = await insertExpense(db, id, user.id, parsed.row, parsed.shares);
    return NextResponse.json(created, { status: 201 });
  });
}
```

`src/app/api/events/[id]/expenses/[eid]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteExpense, expenseEventId, listParticipants, replaceExpense } from "@/lib/events-repo";
import { jsonError, readJson, withParticipant } from "@/lib/events-api";
import { parseExpenseInput } from "@/lib/expense-input";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eid: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id, eid } = await params;
  return withParticipant(req, id, async ({ db }) => {
    if ((await expenseEventId(db, eid)) !== id) return jsonError(404, "Not found");
    const participants = await listParticipants(db, id);
    const parsed = parseExpenseInput(await readJson(req), participants.map((p) => p.id));
    if (!parsed.ok) return jsonError(400, parsed.error);
    await replaceExpense(db, eid, parsed.row, parsed.shares);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id, eid } = await params;
  return withParticipant(req, id, async ({ db }) => {
    if ((await expenseEventId(db, eid)) !== id) return jsonError(404, "Not found");
    await deleteExpense(db, eid);
    return new NextResponse(null, { status: 204 });
  });
}
```

- [ ] **Step 8: Run, expect PASS**, full `npx vitest run`, `npx tsc --noEmit`.

- [ ] **Step 9: Commit** — stage the five files explicitly, then `git commit -S -m "feat(api): add, edit and delete event expenses"`.

---

### Task 9: Settlements

**Files:** Create `src/app/api/events/[id]/settlements/route.ts`, `src/app/api/events/[id]/settlements/[sid]/route.ts`, test `src/app/api/events/[id]/settlements/route.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  listParticipants: vi.fn(),
  insertSettlement: vi.fn(),
  settlementEventId: vi.fn(),
  deleteSettlement: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import * as repo from "@/lib/events-repo";
import { POST } from "./route";
import { DELETE } from "./[sid]/route";

const ok = { from_participant: "p2", to_participant: "p1", amount_minor: 100, currency: "TRY" };
const post = (b: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(b) });
const ctx = { params: Promise.resolve({ id: "e1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  vi.mocked(repo.findMyParticipant).mockResolvedValue({ id: "p1" });
  vi.mocked(repo.listParticipants).mockResolvedValue([{ id: "p1" }, { id: "p2" }] as never);
  vi.mocked(repo.insertSettlement).mockResolvedValue({ id: "s1" } as never);
});

describe("POST settlements", () => {
  it("records a payment between two participants", async () => {
    expect((await POST(post(ok) as never, ctx)).status).toBe(201);
    expect(repo.insertSettlement).toHaveBeenCalledWith({}, "e1", "u1", ok);
  });

  it.each([
    ["same person", { ...ok, to_participant: "p2" }],
    ["outside participant", { ...ok, from_participant: "p9" }],
    ["zero amount", { ...ok, amount_minor: 0 }],
    ["bad currency", { ...ok, currency: "JPY" }],
  ])("400s a %s", async (_, b) => {
    expect((await POST(post(b) as never, ctx)).status).toBe(400);
  });
});

describe("DELETE settlement", () => {
  const dctx = { params: Promise.resolve({ id: "e1", sid: "s1" }) };
  const del = () => new Request("http://localhost/x", { method: "DELETE" });

  it("404s a payment of another event and deletes one of this event", async () => {
    vi.mocked(repo.settlementEventId).mockResolvedValue("e2");
    expect((await DELETE(del() as never, dctx)).status).toBe(404);
    vi.mocked(repo.settlementEventId).mockResolvedValue("e1");
    expect((await DELETE(del() as never, dctx)).status).toBe(204);
    expect(repo.deleteSettlement).toHaveBeenCalledWith({}, "s1");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `src/app/api/events/[id]/settlements/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { insertSettlement, listParticipants } from "@/lib/events-repo";
import { isCurrency, jsonError, parseAmountMinor, readJson, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withParticipant(req, id, async ({ db, user }) => {
    const body = await readJson(req);
    const ids = new Set((await listParticipants(db, id)).map((p) => p.id));
    const from = body?.from_participant;
    const to = body?.to_participant;
    const amount = parseAmountMinor(body?.amount_minor);
    if (typeof from !== "string" || typeof to !== "string" || !ids.has(from) || !ids.has(to) || from === to) {
      return jsonError(400, "Invalid participants");
    }
    if (amount === null) return jsonError(400, "Invalid amount");
    if (!isCurrency(body?.currency)) return jsonError(400, "Invalid currency");
    const created = await insertSettlement(db, id, user.id, {
      from_participant: from,
      to_participant: to,
      amount_minor: amount,
      currency: body.currency as string,
    });
    return NextResponse.json(created, { status: 201 });
  });
}
```

`src/app/api/events/[id]/settlements/[sid]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteSettlement, settlementEventId } from "@/lib/events-repo";
import { jsonError, withParticipant } from "@/lib/events-api";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  return withParticipant(req, id, async ({ db }) => {
    if ((await settlementEventId(db, sid)) !== id) return jsonError(404, "Not found");
    await deleteSettlement(db, sid);
    return new NextResponse(null, { status: 204 });
  });
}
```

- [ ] **Step 4: Run, expect PASS**, `npx vitest run`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — stage the three files, then `git commit -S -m "feat(api): record and undo event settlements"`.

---

### Task 10: Strings and nav

**Files:** Modify `shared/i18n.ts`, `src/app/dashboard/page.tsx` (nav ~line 185), `src/app/economy/page.tsx` (nav ~line 173). Test `src/lib/shared-i18n.wiring.test.ts` (root).

- [ ] **Step 1: Failing test** — in `src/lib/shared-i18n.wiring.test.ts` add (import `translationsFor` from `@/lib/i18n` if it re-exports it, else from `"../../shared/i18n"`):

```ts
  it("has the event strings in both languages", () => {
    expect(translationsFor("en").events).toBe("Events");
    expect(translationsFor("tr").events).toBe("Etkinlikler");
  });
```

- [ ] **Step 2: Add keys** — in the `en` block:

```ts
    events: "Events",
    newEvent: "New event",
    eventName: "Event name",
    eventDate: "Date",
    noEvents: "No events yet",
    participants: "Participants",
    addParticipant: "Add participant",
    addByName: "Name",
    addByEmail: "Email",
    fromTeams: "From your teams",
    expenses: "Expenses",
    addExpense: "Add expense",
    description: "Description",
    paidBy: "Paid by",
    splitBetween: "Split between",
    splitEqual: "Equally",
    splitExact: "Exact amounts",
    balancesTitle: "Balances",
    settleUp: "Settle up",
    markPaid: "Paid",
    allSettled: "Everyone is even",
    payments: "Payments",
    undo: "Undo",
    youAreOwed: "You are owed",
    youOwe: "You owe",
    closeEvent: "Close event",
    reopenEvent: "Reopen",
    closed: "Closed",
    deleteEvent: "Delete event",
    cannotRemoveParticipant: "This person has expenses or payments",
```

and in `tr`:

```ts
    events: "Etkinlikler",
    newEvent: "Yeni etkinlik",
    eventName: "Etkinlik adı",
    eventDate: "Tarih",
    noEvents: "Henüz etkinlik yok",
    participants: "Katılımcılar",
    addParticipant: "Katılımcı ekle",
    addByName: "İsim",
    addByEmail: "E-posta",
    fromTeams: "Ekiplerinden",
    expenses: "Harcamalar",
    addExpense: "Harcama ekle",
    description: "Açıklama",
    paidBy: "Ödeyen",
    splitBetween: "Paylaşanlar",
    splitEqual: "Eşit",
    splitExact: "Tutar gir",
    balancesTitle: "Bakiyeler",
    settleUp: "Ödeşme",
    markPaid: "Ödendi",
    allSettled: "Herkes ödeşmiş",
    payments: "Ödemeler",
    undo: "Geri al",
    youAreOwed: "Alacağın",
    youOwe: "Borcun",
    closeEvent: "Etkinliği kapat",
    reopenEvent: "Yeniden aç",
    closed: "Kapandı",
    deleteEvent: "Etkinliği sil",
    cannotRemoveParticipant: "Bu kişinin harcaması veya ödemesi var",
```

`remaining` already exists ("Remaining" / "Kalan") and is reused. Before adding, grep both blocks for each key (`description`, `payments`, `closed`, `undo` may already exist with a different meaning). Reuse an existing key with the same meaning; rename a clashing new key with an `event` prefix (e.g. `eventPayments`) and use that name in Task 11.

- [ ] **Step 3: Nav** — in both pages' `<nav>`, add after the existing two entries:

```tsx
              <Link
                href="/events"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition font-medium"
              >
                {t.events}
              </Link>
```

- [ ] **Step 4: Verify** — `npx vitest run`, `npx tsc --noEmit`, and in `mobile/` `npx tsc --noEmit` (the shared dictionary type is used there too).

- [ ] **Step 5: Commit** — `git add shared/i18n.ts src/lib/shared-i18n.wiring.test.ts src/app/dashboard/page.tsx src/app/economy/page.tsx` then `git commit -S -m "feat(web): add event strings and the Events nav entry"`.

---

### Task 11: Web pages

**Files:** Create `src/app/events/page.tsx`, `src/app/events/[id]/page.tsx`, `src/components/events/ExpenseForm.tsx`, `src/components/events/SettleUp.tsx`.

Follow `src/app/economy/page.tsx` for the page shell: `"use client"`, `useSession` redirect to `/` when unauthenticated, the same sticky header with the nav (Events highlighted: `text-purple-700 bg-purple-50`), language toggle, `max-w-5xl` container, cards `bg-white rounded-2xl border border-gray-100 p-5`. Amounts in inputs are typed as decimals and converted with `Math.round(Number(value.replace(",", ".")) * 100)`; display with `formatMinor(amount, currency, t.numberLocale)`.

- [ ] **Step 1: List page** `src/app/events/page.tsx`:
  - Fetch `GET /api/events` on load; render each event as a `Link` to `/events/[id]` with name, date, a "Closed" badge when `status === "closed"`, and `my_balance` per currency (green "You are owed X", red "You owe X").
  - A "New event" form (name, optional date) posting to `/api/events`; on 201 `router.push(/events/<id>)`.
  - Empty state `t.noEvents`.

- [ ] **Step 2: `SettleUp` component** `src/components/events/SettleUp.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { EventDetail } from "@/types";
import { balances, formatMinor, participantLabel, suggestTransfers, type Transfer } from "@/lib/split";
import { useLang } from "@/lib/i18n";

export default function SettleUp({ event, onChanged }: { event: EventDetail; onChanged: () => void }) {
  const { t } = useLang();
  const [busy, setBusy] = useState<string | null>(null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const name = (id: string) => {
    const p = event.participants.find((x) => x.id === id);
    return p ? participantLabel(p) : "?";
  };
  const b = balances(event.expenses, event.settlements);
  const transfers = suggestTransfers(b);
  const key = (tr: Transfer) => `${tr.currency}:${tr.from}:${tr.to}`;

  async function record(tr: Transfer) {
    const typed = partial[key(tr)];
    const amount = typed ? Math.round(Number(typed.replace(",", ".")) * 100) : tr.amount_minor;
    if (!Number.isFinite(amount) || amount <= 0 || amount > tr.amount_minor) return;
    setBusy(key(tr));
    try {
      await fetch(`/api/events/${event.id}/settlements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from_participant: tr.from, to_participant: tr.to, amount_minor: amount, currency: tr.currency }),
      });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function undo(id: string) {
    await fetch(`/api/events/${event.id}/settlements/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="font-semibold text-gray-800 mb-2">{t.balancesTitle}</h3>
        {Object.entries(b).map(([currency, row]) => (
          <div key={currency} className="mb-2">
            {Object.entries(row)
              .filter(([, v]) => v !== 0)
              .map(([pid, v]) => (
                <div key={pid} className="flex justify-between text-sm">
                  <span>{name(pid)}</span>
                  <span className={v > 0 ? "text-green-600" : "text-red-600"}>{formatMinor(v, currency, t.numberLocale)}</span>
                </div>
              ))}
          </div>
        ))}
      </section>
      <section>
        <h3 className="font-semibold text-gray-800 mb-2">{t.settleUp}</h3>
        {transfers.length === 0 ? <p className="text-sm text-gray-400">{t.allSettled}</p> : null}
        {transfers.map((tr) => (
          <div key={key(tr)} className="flex items-center gap-2 text-sm py-1">
            <span className="flex-1">
              {name(tr.from)} → {name(tr.to)}: <b>{formatMinor(tr.amount_minor, tr.currency, t.numberLocale)}</b>
            </span>
            <input
              inputMode="decimal"
              placeholder={(tr.amount_minor / 100).toString()}
              value={partial[key(tr)] ?? ""}
              onChange={(e) => setPartial({ ...partial, [key(tr)]: e.target.value })}
              className="w-24 rounded-lg border border-gray-200 px-2 py-1"
            />
            <button
              disabled={busy === key(tr)}
              onClick={() => record(tr)}
              className="rounded-lg bg-green-600 px-3 py-1 text-white disabled:opacity-50">
              {t.markPaid}
            </button>
          </div>
        ))}
      </section>
      {event.settlements.length ? (
        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t.payments}</h3>
          {event.settlements.map((s) => (
            <div key={s.id} className="flex justify-between text-sm py-1">
              <span>
                {name(s.from_participant)} → {name(s.to_participant)}: {formatMinor(s.amount_minor, s.currency, t.numberLocale)}
              </span>
              <button onClick={() => undo(s.id)} className="text-gray-400 hover:text-red-600">{t.undo}</button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `ExpenseForm` component** `src/components/events/ExpenseForm.tsx`: props `{ event: EventDetail; expense?: EventExpense; onDone: () => void; onCancel: () => void }`. Fields: description, amount (decimal), currency select (`ALLOWED_CURRENCIES`), paid-by select (participants, default: the signed-in user's participant), date (default today, `toISOString().slice(0,10)` of local date via the existing date helper if one exists in `src/lib`), split mode toggle (equal / exact), participant checkboxes (all checked by default) for equal, per-participant decimal inputs for exact with a live `t.remaining` line (`amount − sum`; submit disabled unless it is exactly 0). Submit builds the `ExpenseInput` JSON and calls `POST /api/events/[id]/expenses` or `PUT .../expenses/[eid]` when editing; on a non-2xx response show the server's `error` text under the form; on success `onDone()`. When editing, prefill exact mode with the stored shares if they are not an equal split of the same participants (compare with `splitEqually`), else equal mode with those participants checked.

- [ ] **Step 4: Detail page** `src/app/events/[id]/page.tsx`: `useParams()` for the id; `load()` fetches `GET /api/events/[id]` (404 → "not found" message with a link back). Layout: header with name, date, status badge; creator-only buttons close/reopen (`PATCH {status}`) and delete (`DELETE`, confirm with `window.confirm`, then `router.push("/events")`). Sections:
  - Participants: chips with label (`participantLabel`), an × that calls `DELETE .../participants/[pid]` and shows `t.cannotRemoveParticipant` on 409; an add row with three ways: a select of team mates (from `GET /api/teams`, members not yet in the event, excluding self), an email input, a name input; each posts to `.../participants`.
  - Expenses: list with description, payer, amount, date, edit (opens `ExpenseForm` with `expense`) and delete; "Add expense" opens an empty `ExpenseForm`. Hidden when the event is closed except for viewing.
  - `<SettleUp event={detail} onChanged={load} />`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit`, `npx vitest run`, `npm run lint` at the root, and `npm run build` (catches server/client boundary errors in the new pages).

- [ ] **Step 6: Commit** — stage the four files, then `git commit -S -m "feat(web): add the events list and detail pages"`.

---

### Task 12: Manual check (owner)

- [ ] Run the Task 1 SQL in the Supabase SQL editor.
- [ ] `npm run dev`, sign in, open Events:
  - create "Test trip"; add a team mate, a name-only person "Can", and one by email,
  - add three expenses: one equal for all in TRY, one equal for a subset in TRY, one exact split in EUR,
  - check balances add up to zero per currency and the suggested transfers match a hand calculation,
  - record one full and one partial payment, then undo one,
  - as the team mate (second browser profile), open the event and add an expense,
  - try removing "Can" after he has a share (409 message), close the event, delete a separate empty event.
- [ ] Report anything wrong; fixes go in new commits.

---

## Self-review notes

- Spec coverage: tables and RLS (Task 1), split math with remainder and per-currency settle-up (Task 2), membership-gated API returning 404 to outsiders (Tasks 4–9), creator-only close/delete (Task 6), participant rules incl. 409 (Task 7), equal/exact split validation (Task 8), partial payments and undo (Tasks 9, 11), i18n and nav (Task 10), pages (Task 11). Mobile is phase 2.
- `my_balance` sign: positive = owed to the caller, same as `balances`.
- Known limits recorded for the PR: `GET /api/events` is N+1; expense edit is two writes, not a transaction.
