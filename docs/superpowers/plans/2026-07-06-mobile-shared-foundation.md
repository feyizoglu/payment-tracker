# Mobile Shared Foundation Implementation Plan (Plan 3a/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web app's pure occurrence logic (`payments.ts`) and i18n dictionaries (`i18n.tsx`) into `shared/`, leaving one-line re-export shims at the old `src/lib/` paths so the Next.js app is byte-for-byte unaffected, and prove the moved modules resolve and bundle in the Expo mobile app.

**Architecture:** Mirror the existing type-consolidation pattern — `src/types/index.ts` is already just `export * from "../../shared/types"`. Do the same for `payments` and `i18n`: the real code lives in `shared/`, and `src/lib/{payments.ts,i18n.tsx}` become re-export shims so every existing `@/lib/*` import keeps working with zero churn. Mobile consumes the moved code via its existing `@shared/*` tsconfig path + Metro `watchFolders`. This plan wires and validates the foundation; the mobile screens that use it come in Plans 3b–3f.

**Tech Stack:** TypeScript, date-fns (pure occurrence math), React context (i18n), Next.js (web, unchanged), Expo/Metro + Vitest (mobile).

---

## Prerequisites (context — no action)

- `shared/types.ts` already holds every type (`Payment`, `Occurrence`, `CurrencyAmount`, `PaymentInstallment`, `RecurringPayment`, `PaymentOverride`, `RecurringEntry`, `Asset`, `ExchangeRates`, …). `src/types/index.ts` is `export * from "../../shared/types"`.
- `src/lib/payments.ts` imports types from `@/types` and `{ addMonths, setDate, isAfter, isBefore, startOfDay }` from `date-fns`. Only `addMonths` and `setDate` are actually used (`isAfter`/`isBefore`/`startOfDay` are dead imports — the root ESLint already warns on them).
- `src/lib/i18n.tsx` starts with `"use client";`, imports from `react`, and exports `LanguageProvider`, `useLang`, plus internal `translations`, `Lang`, `Translations`, `LangContext`. It uses no web-only API (no `localStorage`/`window`/`next`).
- Mobile tsconfig: `@shared/*` → `../shared/*`. Mobile `metro.config.js`: `watchFolders = [path.resolve(repoRoot, "shared")]`, `resolver.nodeModulesPaths = [<mobile>/node_modules]`.
- Mobile does NOT have `date-fns` yet (Task 3 adds it).

---

## File Structure

- `shared/payments.ts` — **new** (moved from `src/lib/payments.ts`); pure occurrence/currency logic, imports types from `./types`.
- `src/lib/payments.ts` — **becomes** `export * from "../../shared/payments";` (re-export shim).
- `shared/i18n.tsx` — **new** (moved from `src/lib/i18n.tsx`); TR/EN dictionaries + `LanguageProvider`/`useLang`, keeps `"use client"`.
- `src/lib/i18n.tsx` — **becomes** `export * from "../../shared/i18n";` (re-export shim).
- `mobile/src/lib/shared-payments.wiring.test.ts` — **new**; proves `@shared/payments` resolves + bundles (date-fns) in the mobile toolchain.
- `mobile/src/lib/shared-i18n.wiring.test.ts` — **new**; proves `@shared/i18n` dictionaries resolve in the mobile toolchain.
- `mobile/package.json` / `mobile/package-lock.json` — **modified** (adds `date-fns`).
- `src/lib/payments.test.ts` — **unchanged** (keeps importing `@/lib/payments`, which now resolves through the shim to shared; still run by root Vitest).

---

## Task 1: Move occurrence logic to `shared/payments.ts`, leave a web shim

Moves the pure logic to `shared/` and re-exports it from the old path so the Next.js app is unchanged.

**Files:**
- Create: `shared/payments.ts` (via `git mv`)
- Modify: `shared/payments.ts` import lines
- Create: `src/lib/payments.ts` (new shim, after the move)

- [ ] **Step 1: Baseline — web is green before the move**

Run: `npx tsc --noEmit && npm test`
Expected: root `tsc` clean; Vitest 67 tests pass. (If not, stop — the tree was already broken.)

- [ ] **Step 2: Move the file to shared/ (preserves content + history)**

```bash
git mv src/lib/payments.ts shared/payments.ts
```

- [ ] **Step 3: Fix the type import inside `shared/payments.ts`**

The moved file's first line imports from `@/types` (a web-only alias). Change it to the sibling shared types, and drop the three unused `date-fns` names.

Change line 1 from:
```ts
import { Payment, PaymentInstallment, RecurringPayment, Occurrence, CurrencyAmount } from "@/types";
```
to:
```ts
import { Payment, PaymentInstallment, RecurringPayment, Occurrence, CurrencyAmount } from "./types";
```

Change line 2 from:
```ts
import { addMonths, setDate, isAfter, isBefore, startOfDay } from "date-fns";
```
to:
```ts
import { addMonths, setDate } from "date-fns";
```

(No other line changes — the rest of the file already only references those two date-fns helpers and the shared types.)

- [ ] **Step 4: Create the re-export shim at the old path**

Create `src/lib/payments.ts` with exactly:
```ts
export * from "../../shared/payments";
```

- [ ] **Step 5: Verify web is still byte-for-byte green**

Run: `npx tsc --noEmit && npm test`
Expected: root `tsc` clean; Vitest **67 tests pass** (unchanged — `payments.test.ts` imports `@/lib/payments` → shim → `shared/payments`).

- [ ] **Step 6: Commit**

```bash
git add shared/payments.ts src/lib/payments.ts
git commit -m "refactor(shared): move occurrence logic to shared/payments.ts with web shim"
```

---

## Task 2: Expose the shared logic to mobile as a local package `@ptracker/shared`

> **Implementation note (supersedes the original date-fns-only plan):** Metro will
> NOT bundle runtime (value) imports of source files that live outside the mobile
> project root — a bare `@shared/*` source import of `shared/payments.ts` fails with
> "Failed to get the SHA-1". (Type-only imports were erased at compile time and hid
> this.) The fix is to make `shared/` a real local package (`@ptracker/shared`) and
> consume it from `mobile` as a `file:../shared` dependency; Metro reliably bundles
> node_modules packages (even symlinked to a sibling dir). Mobile imports switch
> from `@shared/*` to `@ptracker/shared/*`. Web keeps its relative re-export shims
> (unchanged). This also delivers the date-fns dependency (declared by the shared
> package + installed in mobile). Steps below reflect this approach.

Concretely: create `shared/package.json`, add `@ptracker/shared` + `date-fns` to
mobile, rename mobile's `@shared/*` imports to `@ptracker/shared/*`, use
`getCurrencySymbol` in the Payments screen (a real value import that forces Metro
to bundle the shared module + date-fns), and prove it with `expo export`.

The original wiring unit test is retained as a toolchain proof.

**Files:**
- Modify: `mobile/package.json`, `mobile/package-lock.json`
- Create: `mobile/src/lib/shared-payments.wiring.test.ts`

- [ ] **Step 1: Write the failing wiring test**

Create `mobile/src/lib/shared-payments.wiring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getOccurrencesForMonth, getCurrencySymbol } from "@shared/payments";
import type { Payment } from "@shared/types";

// Proves the moved shared occurrence logic resolves through the mobile
// toolchain (@shared alias + Metro/node date-fns) — not a re-test of the
// logic itself (that lives in the web-side payments.test.ts).
describe("shared/payments wiring (mobile)", () => {
  it("resolves and computes a July installment occurrence", () => {
    const payment: Payment = {
      id: "p1", team_id: null, user_id: "u1", name: "Laptop",
      amount: 1200, currency: "TRY", start_date: "2026-07-10",
      day_of_month: 10, total_installments: 12, paid_installments: 0,
      created_at: "2026-07-01T00:00:00Z",
    };
    const occ = getOccurrencesForMonth([payment], [], 2026, 6); // July
    expect(occ.length).toBe(1);
    expect(occ[0].dueDate.getDate()).toBe(10);
  });

  it("exposes currency symbols", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
  });
});
```

- [ ] **Step 2: Run it — expect a resolution failure (date-fns not installed)**

Run: `cd mobile && npx vitest run src/lib/shared-payments.wiring.test.ts`
Expected: FAIL — Vitest cannot resolve `date-fns` (transitively imported by `@shared/payments`).

- [ ] **Step 3: Install date-fns into the mobile package**

```bash
cd mobile && npx expo install date-fns
```
Expected: `date-fns` added to `mobile/package.json` dependencies; no fatal errors.

- [ ] **Step 4: Run the wiring test — expect PASS**

Run: `cd mobile && npx vitest run src/lib/shared-payments.wiring.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full mobile check — types, all tests, and RN bundle**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: `tsc` clean; all mobile tests pass (13 prior + 2 new = 15).

Then run the bundle proof (this is the real evidence date-fns bundles under React Native / Hermes):
```bash
cd mobile && npx expo export --platform android --output-dir /tmp/expo-export-3a && rm -rf /tmp/expo-export-3a
```
Expected: export completes with no bundling/resolution errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/package.json mobile/package-lock.json mobile/src/lib/shared-payments.wiring.test.ts
git commit -m "feat(mobile): add date-fns and prove @shared/payments bundles"
```

---

## Task 3: Move i18n to `shared/i18n.tsx`, leave a web shim

Same move pattern for the translation dictionaries + React provider. It is platform-agnostic React (no web-only APIs), so it moves wholesale; the `"use client"` directive is preserved (Next treats it as a client module; React Native ignores it).

**Files:**
- Create: `shared/i18n.tsx` (via `git mv`)
- Create: `src/lib/i18n.tsx` (new shim, after the move)

- [ ] **Step 1: Move the file to shared/ (preserves content + history)**

```bash
git mv src/lib/i18n.tsx shared/i18n.tsx
```

No content edits are needed inside `shared/i18n.tsx` — it imports only from `react` and defines everything locally, so it is valid unchanged at its new location. Keep the leading `"use client";`.

- [ ] **Step 2: Create the re-export shim at the old path**

Create `src/lib/i18n.tsx` with exactly:
```tsx
export * from "../../shared/i18n";
```

- [ ] **Step 3: Verify web is still green (provider + strings unchanged)**

Run: `npx tsc --noEmit && npm test`
Expected: root `tsc` clean; Vitest 67 tests pass. (`src/app/layout.tsx` imports `LanguageProvider` from `@/lib/i18n` → shim → shared; components import `useLang` the same way.)

- [ ] **Step 4: Build the web app to confirm the client-component directive survives the move**

Run: `npm run build`
Expected: `next build` succeeds (no "useContext only works in a Client Component" error), proving `"use client"` is honored from `shared/i18n.tsx`.

- [ ] **Step 5: Commit**

```bash
git add shared/i18n.tsx src/lib/i18n.tsx
git commit -m "refactor(shared): move i18n dictionaries + provider to shared/i18n.tsx with web shim"
```

---

## Task 4: Prove `@shared/i18n` resolves in mobile

Confirms the shared dictionaries are importable from the mobile toolchain (setup for the Plan 3f language switcher). Reads only the pure dictionary data — does not render the provider.

**Files:**
- Create: `mobile/src/lib/shared-i18n.wiring.test.ts`

- [ ] **Step 1: Write the wiring test**

Create `mobile/src/lib/shared-i18n.wiring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { useLang, LanguageProvider } from "@shared/i18n";

// Proves the shared i18n module resolves through the mobile toolchain.
// We assert on the exported provider/hook identities rather than rendering,
// so the test stays in the node env with no React renderer.
describe("shared/i18n wiring (mobile)", () => {
  it("exposes the provider and hook", () => {
    expect(typeof LanguageProvider).toBe("function");
    expect(typeof useLang).toBe("function");
  });
});
```

- [ ] **Step 2: Run it — expect PASS**

Run: `cd mobile && npx vitest run src/lib/shared-i18n.wiring.test.ts`
Expected: PASS (1 test). (If it fails on a `react` resolution error, that is the signal to investigate the mobile `react` dep — but `react` is already a mobile dependency.)

- [ ] **Step 3: Full mobile check + bundle**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: `tsc` clean; all mobile tests pass (15 prior + 1 new = 16).

```bash
cd mobile && npx expo export --platform android --output-dir /tmp/expo-export-3a && rm -rf /tmp/expo-export-3a
```
Expected: export completes cleanly (shared/i18n + shared/payments both bundle).

- [ ] **Step 4: Commit**

```bash
cd /Users/tolgahan.feyizoglu/Desktop/payment-tracker
git add mobile/src/lib/shared-i18n.wiring.test.ts
git commit -m "feat(mobile): prove @shared/i18n resolves in the mobile toolchain"
```

---

## Final verification (after all tasks)

- [ ] Web unchanged: from repo root `npx tsc --noEmit && npm test` → root `tsc` clean, **67 tests pass**.
- [ ] Web builds: `npm run build` → succeeds (client-component directive intact).
- [ ] Mobile types + tests: `cd mobile && npx tsc --noEmit && npm test` → clean; **16 tests pass** (13 original + 3 wiring).
- [ ] Mobile bundle: `cd mobile && npx expo export --platform android --output-dir /tmp/expo-export-3a` → completes; then `rm -rf /tmp/expo-export-3a`.
- [ ] Shims verified: `src/lib/payments.ts` and `src/lib/i18n.tsx` each contain only a single `export * from "../../shared/..."` line; the real code lives in `shared/`.

## What this plan deliberately leaves to later plans

- **Plan 3b:** Ödemeler tab — month nav, monthly list ↔ calendar toggle, payment cards, mark-paid (consumes `@shared/payments`).
- **Plan 3c:** Add/Edit forms + per-occurrence overrides (multi-currency).
- **Plan 3d:** Ekonomi (assets + rates). **Plan 3e:** Raporlar. **Plan 3f:** Ayarlar/Teams + language switcher (consumes `@shared/i18n` provider).
