# Event Expense Splitting (Phase 2: mobile tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The mobile app gets an "Events" tab with the same list, detail, expense form and settle-up as the web, on the phase 1 API.

**Architecture:** Screens call the existing `/api/events/**` routes through `useAuth().api`. All math comes from `@ptracker/shared/split` (`balances`, `suggestTransfers`, `splitEqually`, `participantLabel`, `formatMinor`, `parseDecimalToMinor`); form state → request body logic goes in a pure, unit-tested `mobile/src/lib/event-forms.ts`. The detail screen is a root-level stack route (like `payment/[id]`), the expense form a root-level modal (like `payment-form`), so both can cover the tabs.

**Tech Stack:** Expo SDK 57, expo-router v57 (`NativeTabs`, `Stack.Protected`), NativeWind, vitest (node, `mobile/src/lib/**/*.test.ts`).

Spec: `docs/superpowers/specs/2026-10-16-event-expense-split-design.md`. Phase 1 API: `src/app/api/events/**`; the web pages `src/app/events/**` and `src/components/events/**` are the behavioural reference.

Rules that bite here (from `mobile/AGENTS.md` and project memory):
- Read https://docs.expo.dev/versions/v57.0.0/ for any expo-router API you use.
- Import shared code only as `@ptracker/shared/<module>`; never relative paths out of `mobile/`.
- `shared/` must not contain JSX.
- `tsc` does not catch Metro bundling problems: run `npx expo export --platform android --output-dir /tmp/events-export` before calling a task done, then delete the folder.
- Use `bg-surface`, not `bg-white`, for cards (dark mode). Reuse `components/ui/*` (`FormScreen`, `TextField`, `SelectField`, `DateField`, `SegmentedToggle`, `PrimaryButton`, `DangerLink`, `Field`) and `TabScreen`.
- React Compiler is on; nothing here is called outside a React render, so no `"use no memo"` is needed.

Commit only when the user asks; each task names its commit message.

---

## File map

- Create `mobile/src/lib/event-forms.ts` + `event-forms.test.ts`: expense form ↔ request body, edit prefill.
- Create `mobile/src/app/(app)/events.tsx`: tab screen (list + create).
- Modify `mobile/src/components/app-tabs.tsx`: fifth trigger.
- Create `mobile/src/app/event/[id].tsx`: detail screen.
- Create `mobile/src/app/event-expense.tsx`: add/edit expense modal.
- Create `mobile/src/components/events/settle-up.tsx`, `mobile/src/components/events/participants.tsx`.
- Modify `mobile/src/app/_layout.tsx`: register `event/[id]` and `event-expense` in the protected stack.
- Modify `shared/i18n.ts` only if a string the screens need is missing (add to both `en` and `tr`).

---

### Task 1: Expense form logic

**Files:** Create `mobile/src/lib/event-forms.ts`, test `mobile/src/lib/event-forms.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from "vitest";
import type { EventExpense, EventParticipant } from "@ptracker/shared/types";
import { emptyExpenseForm, expenseFormFromExpense, expenseFormToBody, remainingMinor } from "./event-forms";

const P = (id: string): EventParticipant => ({ id, event_id: "e", user_id: null, display_name: id, created_at: "" });
const participants = [P("p1"), P("p2"), P("p3")];

describe("emptyExpenseForm", () => {
  it("defaults to me as payer, everyone selected, equal split, TRY, today", () => {
    expect(emptyExpenseForm(participants, "p2", "2026-10-16")).toEqual({
      description: "",
      amount: "",
      currency: "TRY",
      paidBy: "p2",
      spentOn: "2026-10-16",
      mode: "equal",
      selected: ["p1", "p2", "p3"],
      exact: { p1: "", p2: "", p3: "" },
    });
  });

  it("falls back to the first participant when I am not found", () => {
    expect(emptyExpenseForm(participants, null, "2026-10-16").paidBy).toBe("p1");
  });
});

describe("expenseFormToBody", () => {
  const base = { ...emptyExpenseForm(participants, "p1", "2026-10-16"), description: " Dinner ", amount: "90,00" };

  it("builds an equal split body", () => {
    expect(expenseFormToBody({ ...base, selected: ["p3", "p1"] }, participants)).toEqual({
      ok: true,
      body: {
        description: "Dinner",
        amount_minor: 9000,
        currency: "TRY",
        paid_by: "p1",
        spent_on: "2026-10-16",
        split: { kind: "equal", participant_ids: ["p1", "p3"] },
      },
    });
  });

  it("builds an exact split body and drops empty inputs", () => {
    const r = expenseFormToBody({ ...base, mode: "exact", exact: { p1: "60", p2: "30", p3: "" } }, participants);
    expect(r).toEqual({
      ok: true,
      body: expect.objectContaining({
        split: { kind: "exact", shares: [{ participant_id: "p1", amount_minor: 6000 }, { participant_id: "p2", amount_minor: 3000 }] },
      }),
    });
  });

  it.each([
    ["blank description", { description: " " }, "description"],
    ["bad amount", { amount: "abc" }, "amount"],
    ["nobody selected", { selected: [] }, "split"],
    ["exact not adding up", { mode: "exact" as const, exact: { p1: "10", p2: "", p3: "" } }, "split"],
    ["bad exact input", { mode: "exact" as const, exact: { p1: "1.234", p2: "", p3: "" } }, "split"],
  ])("rejects %s", (_, override, field) => {
    expect(expenseFormToBody({ ...base, ...override }, participants)).toEqual({ ok: false, field });
  });
});

describe("remainingMinor", () => {
  it("is amount minus the typed exact shares, null while something is unparsable", () => {
    const f = { ...emptyExpenseForm(participants, "p1", "2026-10-16"), amount: "100", mode: "exact" as const };
    expect(remainingMinor({ ...f, exact: { p1: "40", p2: "", p3: "" } })).toBe(6000);
    expect(remainingMinor({ ...f, exact: { p1: "x", p2: "", p3: "" } })).toBeNull();
    expect(remainingMinor({ ...f, amount: "" })).toBeNull();
  });
});

describe("expenseFormFromExpense", () => {
  const expense = (shares: [string, number][]): EventExpense => ({
    id: "x", event_id: "e", description: "Taxi", amount_minor: 10000, currency: "EUR", paid_by: "p2",
    spent_on: "2026-10-10", created_by: "u", created_at: "",
    shares: shares.map(([participant_id, amount_minor]) => ({ participant_id, amount_minor })),
  });

  it("opens an equal split as equal with those participants selected", () => {
    const f = expenseFormFromExpense(expense([["p1", 3334], ["p2", 3333], ["p3", 3333]]), participants);
    expect(f).toMatchObject({ description: "Taxi", amount: "100.00", currency: "EUR", paidBy: "p2", spentOn: "2026-10-10", mode: "equal", selected: ["p1", "p2", "p3"] });
  });

  it("opens anything else as exact with the stored amounts", () => {
    const f = expenseFormFromExpense(expense([["p1", 7000], ["p3", 3000]]), participants);
    expect(f).toMatchObject({ mode: "exact", exact: { p1: "70.00", p2: "", p3: "30.00" } });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — from `mobile/`: `npx vitest run src/lib/event-forms.test.ts`.

- [ ] **Step 3: Implement** `mobile/src/lib/event-forms.ts`:

```ts
import { parseDecimalToMinor, splitEqually } from "@ptracker/shared/split";
import type { EventExpense, EventParticipant, ExpenseInput } from "@ptracker/shared/types";

export interface ExpenseForm {
  description: string;
  amount: string;
  currency: string;
  paidBy: string;
  spentOn: string;
  mode: "equal" | "exact";
  selected: string[];
  exact: Record<string, string>;
}

export type ExpenseFormResult = { ok: true; body: ExpenseInput } | { ok: false; field: "description" | "amount" | "split" };

const minorToText = (m: number) => (m / 100).toFixed(2);

export function emptyExpenseForm(participants: EventParticipant[], myParticipantId: string | null, today: string): ExpenseForm {
  const ids = participants.map((p) => p.id);
  return {
    description: "",
    amount: "",
    currency: "TRY",
    paidBy: myParticipantId && ids.includes(myParticipantId) ? myParticipantId : (ids[0] ?? ""),
    spentOn: today,
    mode: "equal",
    selected: ids,
    exact: Object.fromEntries(ids.map((id) => [id, ""])),
  };
}

export function remainingMinor(form: ExpenseForm): number | null {
  const total = parseDecimalToMinor(form.amount);
  if (total === null) return null;
  let sum = 0;
  for (const text of Object.values(form.exact)) {
    if (!text.trim()) continue;
    const v = parseDecimalToMinor(text);
    if (v === null) return null;
    sum += v;
  }
  return total - sum;
}

export function expenseFormToBody(form: ExpenseForm, participants: EventParticipant[]): ExpenseFormResult {
  const description = form.description.trim();
  if (!description) return { ok: false, field: "description" };
  const amount = parseDecimalToMinor(form.amount);
  if (amount === null || amount <= 0) return { ok: false, field: "amount" };
  const order = participants.map((p) => p.id);
  const base = { description, amount_minor: amount, currency: form.currency, paid_by: form.paidBy, spent_on: form.spentOn };
  if (form.mode === "equal") {
    const ids = order.filter((id) => form.selected.includes(id));
    if (ids.length === 0) return { ok: false, field: "split" };
    return { ok: true, body: { ...base, split: { kind: "equal", participant_ids: ids } } };
  }
  const shares: { participant_id: string; amount_minor: number }[] = [];
  for (const id of order) {
    const text = form.exact[id]?.trim() ?? "";
    if (!text) continue;
    const v = parseDecimalToMinor(text);
    if (v === null) return { ok: false, field: "split" };
    if (v > 0) shares.push({ participant_id: id, amount_minor: v });
  }
  if (shares.length === 0 || shares.reduce((s, x) => s + x.amount_minor, 0) !== amount) return { ok: false, field: "split" };
  return { ok: true, body: { ...base, split: { kind: "exact", shares } } };
}

export function expenseFormFromExpense(expense: EventExpense, participants: EventParticipant[]): ExpenseForm {
  const order = participants.map((p) => p.id);
  const sharedIds = order.filter((id) => expense.shares.some((s) => s.participant_id === id));
  const equal = splitEqually(expense.amount_minor, sharedIds);
  const isEqual =
    equal.length === expense.shares.length &&
    equal.every((e) => expense.shares.some((s) => s.participant_id === e.participant_id && s.amount_minor === e.amount_minor));
  return {
    description: expense.description,
    amount: minorToText(expense.amount_minor),
    currency: expense.currency,
    paidBy: expense.paid_by,
    spentOn: expense.spent_on,
    mode: isEqual ? "equal" : "exact",
    selected: isEqual ? sharedIds : order,
    exact: Object.fromEntries(
      order.map((id) => {
        const s = expense.shares.find((x) => x.participant_id === id);
        return [id, isEqual || !s ? "" : minorToText(s.amount_minor)];
      })
    ),
  };
}
```

Confirm `parseDecimalToMinor("90,00")` returns 9000 and `"100"` returns 10000 in `shared/split.ts`; the tests above rely on it.

- [ ] **Step 4: Run, expect PASS**; full `npx vitest run`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add mobile/src/lib/event-forms.ts mobile/src/lib/event-forms.test.ts` then `git commit -S -m "feat(mobile): add event expense form logic"`.

---

### Task 2: Events tab

**Files:** Create `mobile/src/app/(app)/events.tsx`. Modify `mobile/src/components/app-tabs.tsx`, `mobile/src/app/_layout.tsx`.

- [ ] **Step 1: Tab trigger** — in `app-tabs.tsx`, between `reports` and `settings`:

```tsx
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Label>{t.events}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="groups" />
      </NativeTabs.Trigger>
```

- [ ] **Step 2: Root stack** — in `_layout.tsx`, inside the authenticated `Stack.Protected`, after `manual-gold`:

```tsx
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="event-expense" options={{ presentation: 'modal' }} />
```

- [ ] **Step 3: Screen** `(app)/events.tsx`, following `(app)/index.tsx` for loading/refresh (`useFocusEffect` + `RefreshControl`, `TabScreen`, error text):
  - `GET /api/events` → list of `EventSummary`. Each row (`Pressable`, `bg-surface rounded-xl border p-3`): name, date, a "closed" badge, and `my_balance` per currency (green `t.youAreOwed` + amount, red `t.youOwe` + absolute amount, via `formatMinor(…, localeFor(lang))`). Tap → `router.push({ pathname: "/event/[id]", params: { id } })`.
  - A create row at the top: `TextField` for the name + `PrimaryButton` `t.newEvent`; `POST /api/events` `{ name }`, then navigate to the new event.
  - Empty state `t.noEvents`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npx vitest run`, `npx expo export --platform android --output-dir /tmp/events-export` (then `rm -rf /tmp/events-export`).

- [ ] **Step 5: Commit** — stage the three files; `git commit -S -m "feat(mobile): add the Events tab"`.

---

### Task 3: Event detail, participants, settle-up

**Files:** Create `mobile/src/app/event/[id].tsx`, `mobile/src/components/events/participants.tsx`, `mobile/src/components/events/settle-up.tsx`.

Behaviour mirrors `src/app/events/[id]/page.tsx`, `src/components/events/Participants.tsx` and `src/components/events/SettleUp.tsx` on the web; read them first.

- [ ] **Step 1: Detail screen** `event/[id].tsx`: `useLocalSearchParams<{ id: string }>()`; `load()` = `GET /api/events/{id}` on focus (`useFocusEffect`) so returning from the expense modal refreshes; a 404 (`ApiError` status 404) shows `t.eventNotFound` with a back button. Header via the same pattern `payment/[id].tsx` uses (read it), title = event name, closed badge. Creator-only (`event.created_by === user?.id`): close/reopen (`PATCH {status}`) and delete (`Alert.alert` confirm with `t.eventDeleteConfirm`, then `router.back()`). Sections in a `ScrollView` with pull-to-refresh: participants, expenses, settle-up.
- [ ] **Step 2: Expenses section** (inside the detail screen): rows with description, payer label (`participantLabel`), amount (`formatMinor`), date; tap → `router.push({ pathname: "/event-expense", params: { eventId, expenseId } })`; long-press → `Alert` confirm then `DELETE …/expenses/{eid}`. "+ `t.addExpense`" button → `/event-expense?eventId=…`. When closed: no add, no tap-to-edit, no delete.
- [ ] **Step 3: `participants.tsx`**: chips with labels; × on non-creator chips (only when open) → `DELETE …/participants/{pid}`, a 409 shows `t.cannotRemoveParticipant`; add controls (only when open): a `SelectField` of team mates from `GET /api/teams` not already in the event and not me (`POST {user_id}`), a `TextField` + button for email (`POST {email}`) and for a name (`POST {display_name}`). Show server error text (`ApiError.message`) inline. Busy guards on every request.
- [ ] **Step 4: `settle-up.tsx`**: balances per currency (non-zero rows, green/red), suggested transfers from `suggestTransfers(balances(...))`, each with an optional partial `TextField` (`keyboardType="decimal-pad"`, placeholder = full amount) and a `t.markPaid` button → `POST …/settlements`; recorded payments with `t.undo` → `Alert` confirm (`t.undoPaymentConfirm`) → `DELETE …/settlements/{sid}`. Use `parseDecimalToMinor` for the partial amount; invalid or larger than the suggestion → inline `t.invalidAmount`. Hide the paid/undo controls when closed. Show server errors inline; busy guards; `onChanged` prop reloads the event.
- [ ] **Step 5: Verify** — tsc, vitest, expo export as in Task 2.
- [ ] **Step 6: Commit** — stage the three files; `git commit -S -m "feat(mobile): add the event detail screen"`.

---

### Task 4: Expense modal

**Files:** Create `mobile/src/app/event-expense.tsx`.

- [ ] **Step 1: Screen**: `useLocalSearchParams<{ eventId: string; expenseId?: string }>()`; load the event (`GET /api/events/{eventId}`); initial form = `expenseFormFromExpense` when editing (find the expense by id) else `emptyExpenseForm(participants, myParticipantId, format(new Date(), "yyyy-MM-dd"))` (my participant = the one whose `user_id === user?.id`). Wrap in `FormScreen` (read `components/ui/form-screen.tsx` and `payment-form.tsx` for the pattern). Fields: `TextField` description; `TextField` amount (`decimal-pad`); `SelectField` currency over `ALLOWED_CURRENCIES` from `@ptracker/shared/payments`; `SelectField` paid-by over participants; `DateField` date; `SegmentedToggle` `t.splitEqual` / `t.splitExact`; equal → a checkbox-like `Pressable` list of participants; exact → a `TextField` per participant plus a `t.remaining` line from `remainingMinor` (red unless 0). Submit with `expenseFormToBody`; on `{ ok: false, field }` show the matching error under that field; on ok `POST …/expenses` or `PUT …/expenses/{expenseId}`, then `router.back()`; server errors shown at the bottom.
- [ ] **Step 2: Verify** — tsc, vitest, expo export.
- [ ] **Step 3: Commit** — `git add mobile/src/app/event-expense.tsx`; `git commit -S -m "feat(mobile): add the event expense form"`.

---

### Task 5: Device check (owner)

Needs the phase 1 SQL applied and the phase 1 API deployed (the app talks to the production API).

- [ ] Build a preview APK (`eas build -p android --profile preview` from `mobile/`); the Events tab is JS-only, but the 1.0.1 build already on the phone can also take it through `eas update --channel preview --environment preview` once phase 1 is deployed.
- [ ] Create an event, add participants three ways, add equal and exact expenses in two currencies, check balances and transfers, record a partial payment, undo it, close the event.

---

## Self-review notes

- Spec coverage (mobile section): fifth tab, list/detail/expense form/settle-up, logic in shared + `mobile/src/lib`.
- Types used across tasks: `ExpenseForm`, `ExpenseFormResult`, `emptyExpenseForm`, `remainingMinor`, `expenseFormToBody`, `expenseFormFromExpense` — defined in Task 1, used in Task 4.
