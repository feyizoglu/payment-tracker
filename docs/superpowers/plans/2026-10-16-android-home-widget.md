# Android Home Screen Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android home screen widget that lists overdue and next-7-day unpaid payments and opens the app on the tapped payment's month.

**Architecture:** `react-native-android-widget` renders a JSX widget from a headless JS task. Pure selection (`widget-items.ts`) and an injected-dependency loader (`widget-data.ts`, fetch + AsyncStorage cache) hold all logic and are unit-tested in node; the widget component, task handler and entry file are thin glue tested on the device. The app asks the widget to redraw after the Payments tab loads and after sign-out.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-router, react-native-android-widget 0.22.x, date-fns, vitest (node env, `src/lib/**/*.test.ts` only).

Spec: `docs/superpowers/specs/2026-10-16-android-home-widget-design.md`.

Run every command from `mobile/` unless stated. Commit only when the user asks; the commit steps below give the message to use then.

---

## File map

- Modify `shared/i18n.ts`: five widget strings in `en` and `tr`; export `translationsFor(lang)`.
- Create `mobile/src/lib/widget-items.ts` (+ `widget-items.test.ts`): `selectWidgetItems`, `widgetMonthUri`.
- Create `mobile/src/lib/widget-data.ts` (+ `widget-data.test.ts`): `WidgetState`, `loadWidgetData`, cache read/write.
- Create `mobile/src/widget/upcoming-payments-widget.tsx`: layout.
- Create `mobile/src/widget/task-handler.tsx`: `widgetTaskHandler`, `renderWidgetState`.
- Create `mobile/src/lib/widget-refresh.ts`: `refreshWidget()`.
- Create `mobile/index.ts`: entry that loads expo-router and registers the task handler.
- Modify `mobile/package.json` (`main`, dependency), `mobile/app.json` (`version`, plugin).
- Modify `mobile/src/app/(app)/index.tsx` (`load`), `mobile/src/lib/auth-context.tsx` (`signOut`), `mobile/src/lib/auth-context.test.ts` (mock + one test).

---

### Task 1: Widget strings in shared i18n

**Files:**
- Modify: `shared/i18n.ts` (the `en` block near line 192, the `tr` block near line 380, below `type Translations` at line 395)
- Test: `mobile/src/lib/shared-i18n.wiring.test.ts`

- [ ] **Step 1: Write the failing test** — append to `mobile/src/lib/shared-i18n.wiring.test.ts`, inside the existing `describe`, and add `translationsFor` to its import from `@ptracker/shared/i18n`:

```ts
  it("exposes the widget strings in both languages", () => {
    expect(translationsFor("en").widgetTitle).toBe("Upcoming payments");
    expect(translationsFor("tr").widgetTitle).toBe("Yaklaşan ödemeler");
    expect(translationsFor("tr").widgetMore.replace("{n}", "3")).toBe("+3 daha");
  });
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/lib/shared-i18n.wiring.test.ts` → `translationsFor is not a function` (or not exported).

- [ ] **Step 3: Implement** — in the `en` object, after `noPaymentsThisDay`:

```ts
    widgetTitle: "Upcoming payments",
    widgetEmpty: "Nothing due in the next 7 days",
    widgetSignIn: "Sign in to see your payments",
    widgetRefreshFailed: "Couldn't refresh",
    widgetMore: "+{n} more",
```

In the `tr` object, after its `noPaymentsThisDay`:

```ts
    widgetTitle: "Yaklaşan ödemeler",
    widgetEmpty: "Önümüzdeki 7 gün boş",
    widgetSignIn: "Ödemeleri görmek için giriş yap",
    widgetRefreshFailed: "Yenilenemedi",
    widgetMore: "+{n} daha",
```

Below `type Translations = typeof translations.en;`:

```ts
// For code outside the React tree (the home screen widget's headless task).
export function translationsFor(lang: Lang): Translations {
  return translations[lang];
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/shared-i18n.wiring.test.ts`. Also from the repo root run `npx tsc --noEmit` to confirm the web still type-checks (the `tr` block must have every `en` key).

- [ ] **Step 5: Commit** — `git add shared/i18n.ts mobile/src/lib/shared-i18n.wiring.test.ts` then `git commit -S -m "feat(shared): add home screen widget strings"`.

---

### Task 2: `selectWidgetItems` and the month URI

**Files:**
- Create: `mobile/src/lib/widget-items.ts`
- Test: `mobile/src/lib/widget-items.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import type { Occurrence } from "@ptracker/shared/types";
import { selectWidgetItems, widgetMonthUri, WIDGET_MAX_ROWS } from "./widget-items";

function occ(name: string, due: Date, over: Partial<Occurrence> = {}): Occurrence {
  return {
    kind: "recurring",
    sourceId: name,
    name,
    currency: "TRY",
    user_id: "u1",
    team_id: null,
    dueDate: due,
    amount: 100,
    isPaid: false,
    ...over,
  };
}

const TODAY = new Date(2026, 9, 16, 14, 30); // 16 Oct 2026, mid-afternoon

describe("selectWidgetItems", () => {
  it("puts overdue first, then the next 7 days, each by due date", () => {
    const { items } = selectWidgetItems(
      [
        occ("soon", new Date(2026, 9, 18)),
        occ("late-recent", new Date(2026, 9, 15)),
        occ("today", new Date(2026, 9, 16)),
        occ("late-old", new Date(2026, 8, 30)),
      ],
      TODAY
    );
    expect(items.map((i) => [i.name, i.overdue])).toEqual([
      ["late-old", true],
      ["late-recent", true],
      ["today", false],
      ["soon", false],
    ]);
  });

  it("includes day +7 and excludes day +8", () => {
    const { items } = selectWidgetItems(
      [occ("d7", new Date(2026, 9, 23)), occ("d8", new Date(2026, 9, 24))],
      TODAY
    );
    expect(items.map((i) => i.name)).toEqual(["d7"]);
  });

  it("drops paid occurrences", () => {
    const { items } = selectWidgetItems([occ("paid", new Date(2026, 9, 17), { isPaid: true })], TODAY);
    expect(items).toEqual([]);
  });

  it("caps the rows and counts the rest", () => {
    const many = Array.from({ length: WIDGET_MAX_ROWS + 2 }, (_, i) => occ(`p${i}`, new Date(2026, 9, 17)));
    const { items, moreCount } = selectWidgetItems(many, TODAY);
    expect(items).toHaveLength(WIDGET_MAX_ROWS);
    expect(moreCount).toBe(2);
  });

  it("keeps the fields the widget row needs, null amount included", () => {
    const { items } = selectWidgetItems([occ("x", new Date(2026, 9, 17), { amount: null, user_id: "u9" })], TODAY);
    expect(items[0]).toEqual({
      key: "recurring:x:2026-10-17",
      name: "x",
      dueDate: "2026-10-17",
      amount: null,
      currency: "TRY",
      userId: "u9",
      overdue: false,
    });
  });
});

describe("widgetMonthUri", () => {
  it("links to the payment's month with a tap marker", () => {
    expect(widgetMonthUri("2026-10-17", 123)).toBe("paymenttracker:///?month=2026-10&tap=123");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/widget-items.test.ts` → cannot resolve `./widget-items`.

- [ ] **Step 3: Implement** `mobile/src/lib/widget-items.ts`:

```ts
import { addDays, startOfDay } from "date-fns";
import type { Occurrence } from "@ptracker/shared/types";
import { toIsoDate } from "./dates";

export const WIDGET_MAX_ROWS = 4;
const WINDOW_DAYS = 7;

// Plain JSON so it survives the AsyncStorage cache; dueDate is "yyyy-MM-dd".
export interface WidgetItem {
  key: string;
  name: string;
  dueDate: string;
  amount: number | null;
  currency: string;
  userId: string;
  overdue: boolean;
}

export function selectWidgetItems(
  occurrences: Occurrence[],
  now: Date
): { items: WidgetItem[]; moreCount: number } {
  const today = startOfDay(now);
  const windowEnd = addDays(today, WINDOW_DAYS + 1);
  const due = occurrences
    .filter((o) => !o.isPaid && o.dueDate < windowEnd)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((o) => {
      const dueDate = toIsoDate(o.dueDate);
      return {
        key: `${o.kind}:${o.sourceId}:${dueDate}`,
        name: o.name,
        dueDate,
        amount: o.amount,
        currency: o.currency,
        userId: o.user_id,
        overdue: o.dueDate < today,
      };
    });
  return { items: due.slice(0, WIDGET_MAX_ROWS), moreCount: Math.max(0, due.length - WIDGET_MAX_ROWS) };
}

export function widgetMonthUri(dueDate: string, tap: number): string {
  return `paymenttracker:///?month=${dueDate.slice(0, 7)}&tap=${tap}`;
}
```

`toIsoDate` (`src/lib/dates.ts:8`) returns the local `yyyy-MM-dd`. Overdue sorts first because every overdue date is earlier than every in-window date.

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/widget-items.test.ts`.

- [ ] **Step 5: Commit** — `git add mobile/src/lib/widget-items.ts mobile/src/lib/widget-items.test.ts` then `git commit -S -m "feat(mobile): select overdue and next-week payments for the widget"`.

---

### Task 3: `loadWidgetData` with cache

**Files:**
- Create: `mobile/src/lib/widget-data.ts`
- Test: `mobile/src/lib/widget-data.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "./api";
import { loadWidgetData, type WidgetDeps } from "./widget-data";

const NOW = new Date(2026, 9, 16, 9, 0);
const RECURRING = {
  id: "r1",
  name: "Rent",
  currency: "TRY",
  user_id: "u1",
  team_id: null,
  day_of_month: 18,
  start_month: "2026-01-01",
  end_month: null,
  created_at: "2026-01-01T00:00:00Z",
  entries: [],
};

let store: Record<string, string>;
let deps: WidgetDeps;
const get = vi.fn();

beforeEach(() => {
  store = {};
  get.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/recurring")) return [RECURRING];
    if (path === "/api/teams") return [];
    return [];
  });
  deps = {
    getToken: async () => "jwt",
    get,
    now: () => NOW,
    readCache: async () => store.widget ?? null,
    writeCache: async (v) => {
      store.widget = v;
    },
    clearCache: async () => {
      delete store.widget;
    },
  };
});

describe("loadWidgetData", () => {
  it("is signed-out with no token and clears the cache", async () => {
    store.widget = "old";
    deps.getToken = async () => null;
    expect(await loadWidgetData(deps)).toEqual({ kind: "signed-out" });
    expect(store.widget).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("is signed-out on a 401 and clears the cache", async () => {
    store.widget = "old";
    get.mockRejectedValue(new ApiError(401, "unauthorized"));
    expect(await loadWidgetData(deps)).toEqual({ kind: "signed-out" });
    expect(store.widget).toBeUndefined();
  });

  it("returns items, people and the refresh time, and caches them", async () => {
    const state = await loadWidgetData(deps);
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    expect(state.items.map((i) => [i.name, i.dueDate])).toEqual([
      ["Rent", "2026-09-18"],
      ["Rent", "2026-10-18"],
    ]);
    expect(state.updatedAt).toBe(NOW.toISOString());
    expect(JSON.parse(store.widget)).toEqual(state);
  });

  it("tolerates a teams failure", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/teams") throw new ApiError(500, "boom");
      if (path.startsWith("/api/recurring")) return [RECURRING];
      return [];
    });
    expect((await loadWidgetData(deps)).kind).toBe("ok");
  });

  it("falls back to the cache on a network error", async () => {
    const cached = { kind: "ok", items: [], moreCount: 0, people: {}, updatedAt: "2026-10-15T08:00:00.000Z" };
    store.widget = JSON.stringify(cached);
    get.mockRejectedValue(new TypeError("Network request failed"));
    expect(await loadWidgetData(deps)).toEqual(cached);
  });

  it("is an error with no usable cache", async () => {
    store.widget = "{not json";
    get.mockRejectedValue(new TypeError("Network request failed"));
    expect(await loadWidgetData(deps)).toEqual({ kind: "error" });
  });
});
```

The fixture follows `RecurringPayment` in `shared/types.ts:77`; with no entries `getOccurrencesForMonth` yields an unpaid occurrence on the 18th of each month (Sep, Oct, Nov here). Sep 18 is overdue, so the expected list is `[["Rent", "2026-09-18"], ["Rent", "2026-10-18"]]`: use that in the "returns items" test.

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/widget-data.test.ts` → cannot resolve `./widget-data`.

- [ ] **Step 3: Implement** `mobile/src/lib/widget-data.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addMonths } from "date-fns";
import { getOccurrencesForMonth } from "@ptracker/shared/payments";
import type { Payment, RecurringPayment, Team } from "@ptracker/shared/types";
import { ApiError, createApiClient } from "./api";
import { getApiUrl } from "./config";
import { buildPeople, type People } from "./people";
import { getToken } from "./storage";
import { selectWidgetItems, type WidgetItem } from "./widget-items";

const CACHE_KEY = "widget_state";

export type WidgetState =
  | { kind: "ok"; items: WidgetItem[]; moreCount: number; people: People; updatedAt: string }
  | { kind: "signed-out" }
  | { kind: "error" };

export interface WidgetDeps {
  getToken: () => Promise<string | null>;
  get: <T>(path: string) => Promise<T>;
  now: () => Date;
  readCache: () => Promise<string | null>;
  writeCache: (value: string) => Promise<void>;
  clearCache: () => Promise<void>;
}

function parseCached(raw: string | null): WidgetState | null {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.kind === "ok" && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadWidgetData(deps: WidgetDeps): Promise<WidgetState> {
  try {
    if (!(await deps.getToken())) {
      await deps.clearCache();
      return { kind: "signed-out" };
    }
    const [payments, recurrings, teams] = await Promise.all([
      deps.get<Payment[]>("/api/payments?filter=all"),
      deps.get<RecurringPayment[]>("/api/recurring?filter=all"),
      deps.get<Team[]>("/api/teams").catch(() => [] as Team[]),
    ]);
    const now = deps.now();
    // Previous month for overdue, next month for a 7-day window that crosses month end.
    const occurrences = [-1, 0, 1].flatMap((delta) => {
      const d = addMonths(now, delta);
      return getOccurrencesForMonth(payments, recurrings, d.getFullYear(), d.getMonth());
    });
    const state: WidgetState = {
      kind: "ok",
      ...selectWidgetItems(occurrences, now),
      people: buildPeople(teams, null),
      updatedAt: now.toISOString(),
    };
    await deps.writeCache(JSON.stringify(state));
    return state;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await deps.clearCache().catch(() => undefined);
      return { kind: "signed-out" };
    }
    return parseCached(await deps.readCache().catch(() => null)) ?? { kind: "error" };
  }
}

// No onUnauthorized: the widget must never trigger the app's sign-out flow.
export function nativeWidgetDeps(): WidgetDeps {
  const client = createApiClient({ baseUrl: getApiUrl(), getToken });
  return {
    getToken,
    get: (path) => client.get(path),
    now: () => new Date(),
    readCache: () => AsyncStorage.getItem(CACHE_KEY),
    writeCache: (value) => AsyncStorage.setItem(CACHE_KEY, value),
    clearCache: () => AsyncStorage.removeItem(CACHE_KEY),
  };
}
```

The test file imports `./widget-data`, which imports AsyncStorage, `./storage` (expo-secure-store) and `./config`. Add these mocks at the top of the test file, before the imports, matching `economy-storage.test.ts`:

```ts
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("./storage", () => ({ getToken: vi.fn() }));
vi.mock("./config", () => ({ getApiUrl: () => "https://api.test" }));
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/widget-data.test.ts`, then the full suite `npx vitest run` (all green).

- [ ] **Step 5: Commit** — `git add mobile/src/lib/widget-data.ts mobile/src/lib/widget-data.test.ts` then `git commit -S -m "feat(mobile): load and cache the widget's upcoming payments"`.

---

### Task 4: Library, widget layout, task handler, entry, config

**Files:**
- Modify: `mobile/package.json`, `mobile/app.json`
- Create: `mobile/index.ts`, `mobile/src/widget/upcoming-payments-widget.tsx`, `mobile/src/widget/task-handler.tsx`

- [ ] **Step 1: Install** — `npx expo install react-native-android-widget`. Expected: `package.json` gains `"react-native-android-widget": "^0.22.x"`.

- [ ] **Step 2: Widget layout** `mobile/src/widget/upcoming-payments-widget.tsx`:

```tsx
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { format, parseISO } from "date-fns";
import { enUS, tr } from "date-fns/locale";
import { getCurrencySymbol } from "@ptracker/shared/payments";
import { translationsFor, type Lang } from "@ptracker/shared/i18n";
import { personColor } from "@/lib/people";
import type { WidgetState } from "@/lib/widget-data";
import { widgetMonthUri } from "@/lib/widget-items";

type Hex = `#${string}`;

export function UpcomingPaymentsWidget({ state, lang, tap }: { state: WidgetState; lang: Lang; tap: number }) {
  const t = translationsFor(lang);
  const locale = lang === "tr" ? tr : enUS;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: "match_parent", width: "match_parent", backgroundColor: "#FFFFFF", borderRadius: 16, padding: 12 }}>
      <FlexWidget style={{ flexDirection: "row", justifyContent: "space-between", width: "match_parent", marginBottom: 6 }}>
        <TextWidget text={t.widgetTitle} style={{ fontSize: 14, fontWeight: "600", color: "#111827" }} />
        {state.kind === "ok" ? (
          <TextWidget text={format(parseISO(state.updatedAt), "HH:mm")} style={{ fontSize: 11, color: "#9CA3AF" }} />
        ) : null}
      </FlexWidget>
      {state.kind === "signed-out" ? <Note text={t.widgetSignIn} /> : null}
      {state.kind === "error" ? <Note text={t.widgetRefreshFailed} /> : null}
      {state.kind === "ok" && state.items.length === 0 ? <Note text={t.widgetEmpty} /> : null}
      {state.kind === "ok"
        ? state.items.map((item) => (
            <FlexWidget
              key={item.key}
              clickAction="OPEN_URI"
              clickActionData={{ uri: widgetMonthUri(item.dueDate, tap) }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                width: "match_parent",
                paddingVertical: 4,
                paddingLeft: 6,
                borderLeftWidth: 3,
                borderLeftColor: personColor(state.people, item.userId) as Hex,
                marginBottom: 2,
              }}>
              <TextWidget
                text={item.name}
                maxLines={1}
                truncate="END"
                style={{ flex: 1, fontSize: 13, color: item.overdue ? "#DC2626" : "#1F2937" }}
              />
              <TextWidget
                text={format(parseISO(item.dueDate), "d MMM", { locale })}
                style={{ fontSize: 12, color: item.overdue ? "#DC2626" : "#6B7280", marginHorizontal: 6 }}
              />
              <TextWidget
                text={item.amount == null ? "—" : `${getCurrencySymbol(item.currency)}${item.amount}`}
                style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}
              />
            </FlexWidget>
          ))
        : null}
      {state.kind === "ok" && state.moreCount > 0 ? (
        <TextWidget text={t.widgetMore.replace("{n}", String(state.moreCount))} style={{ fontSize: 12, color: "#6B7280" }} />
      ) : null}
    </FlexWidget>
  );
}

function Note({ text }: { text: string }) {
  return <TextWidget text={text} style={{ fontSize: 13, color: "#6B7280", marginTop: 8 }} />;
}
```

`personColor` returns a hex string from `hashColor` or the user's saved colour; if `tsc` rejects the `as Hex` cast because `ColorProp` is narrower, cast to the library's exported `ColorProp` type instead. If the library rejects `flex` or `borderLeftColor`, check `node_modules/react-native-android-widget/src/widgets/utils/style.props.ts` and use the nearest supported prop (e.g. an inner 3px-wide coloured `FlexWidget` instead of a left border).

- [ ] **Step 3: Task handler** `mobile/src/widget/task-handler.tsx`:

```tsx
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { getStoredLanguage } from "@/lib/language-storage";
import { loadWidgetData, nativeWidgetDeps } from "@/lib/widget-data";
import { UpcomingPaymentsWidget } from "./upcoming-payments-widget";

export const WIDGET_NAME = "UpcomingPayments";

export async function renderWidgetState() {
  const [state, lang] = await Promise.all([loadWidgetData(nativeWidgetDeps()), getStoredLanguage()]);
  return <UpcomingPaymentsWidget state={state} lang={lang ?? "en"} tap={Date.now()} />;
}

export async function widgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_ADDED" || widgetAction === "WIDGET_UPDATE" || widgetAction === "WIDGET_RESIZED") {
    renderWidget(await renderWidgetState());
  }
}
```

Check what default language the app uses when nothing is stored (`src/app/_layout.tsx`, `getStoredLanguage()` fallback) and use the same default here instead of `"en"` if it differs.

- [ ] **Step 4: Entry file** `mobile/index.ts`:

```ts
import "expo-router/entry";
import { registerWidgetTaskHandler } from "react-native-android-widget";
import { widgetTaskHandler } from "./src/widget/task-handler";

registerWidgetTaskHandler(widgetTaskHandler);
```

In `mobile/package.json` change `"main": "expo-router/entry"` to `"main": "index.ts"`.

- [ ] **Step 5: Config** — in `mobile/app.json` set `"version": "1.0.1"` and append to `plugins`:

```json
      [
        "react-native-android-widget",
        {
          "widgets": [
            {
              "name": "UpcomingPayments",
              "label": "Upcoming payments",
              "description": "Overdue and next 7 days",
              "minWidth": "250dp",
              "minHeight": "110dp",
              "targetCellWidth": 4,
              "targetCellHeight": 2,
              "resizeMode": "horizontal|vertical",
              "updatePeriodMillis": 1800000,
              "previewImage": "./assets/images/icon.png"
            }
          ]
        }
      ]
```

- [ ] **Step 6: Verify** —
  - `npx tsc --noEmit` → no output.
  - `npx vitest run` → all pass.
  - `npx expo config --type prebuild | grep -n "react-native-android-widget"` → the plugin is listed.
  - `npx expo export --platform android --output-dir /tmp/widget-export` → bundle succeeds (catches a bad entry file). Delete `/tmp/widget-export` afterwards.

- [ ] **Step 7: Commit** — `git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/index.ts mobile/src/widget/upcoming-payments-widget.tsx mobile/src/widget/task-handler.tsx` then `git commit -S -m "feat(mobile): add the upcoming payments home screen widget"`.

---

### Task 5: Redraw the widget from the app

**Files:**
- Create: `mobile/src/lib/widget-refresh.ts`
- Modify: `mobile/src/app/(app)/index.tsx` (`load`, after `setTeams(tm)`), `mobile/src/lib/auth-context.tsx` (`signOut`, after `setUser(null)`)
- Test: `mobile/src/lib/auth-context.test.ts`

- [ ] **Step 1: Write the failing test** — in `auth-context.test.ts` add next to the other `vi.mock` calls:

```ts
vi.mock("./widget-refresh", () => ({ refreshWidget: vi.fn() }));
```

import it (`import { refreshWidget } from "./widget-refresh";`) and add to the `signOut push unregister` describe:

```ts
  it("redraws the home screen widget after the session is cleared", async () => {
    await mount();
    await signOut();
    expect(clearToken).toHaveBeenCalled();
    expect(refreshWidget).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refreshWidget).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(clearToken).mock.invocationCallOrder[0]
    );
  });
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/auth-context.test.ts` → cannot resolve `./widget-refresh`, or `refreshWidget` called 0 times.

- [ ] **Step 3: Implement** `mobile/src/lib/widget-refresh.ts`:

```ts
import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { renderWidgetState, WIDGET_NAME } from "@/widget/task-handler";

// Fire and forget: a widget that fails to redraw must never break the screen that asked.
export function refreshWidget(): void {
  if (Platform.OS !== "android") return;
  requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: renderWidgetState }).catch(() => undefined);
}
```

In `auth-context.tsx` add `import { refreshWidget } from "./widget-refresh";` and, in `signOut`, right after `setUser(null);`:

```ts
    refreshWidget();
```

In `src/app/(app)/index.tsx` add `import { refreshWidget } from "@/lib/widget-refresh";` and, in `load`, right after `setTeams(tm);`:

```ts
      refreshWidget();
```

Mark-paid calls `load()` after the PATCH/PUT, so it redraws too; no separate call is needed. If `requestWidgetUpdate` returns `void` rather than a Promise in 0.22.x, wrap it in `try { … } catch {}` instead of `.catch`.

- [ ] **Step 4: Run, expect PASS** — `npx vitest run` (all pass) and `npx tsc --noEmit`. If `payments-screen.test.ts` now fails because it imports `index.tsx` and the native widget module, add `vi.mock("@/lib/widget-refresh", () => ({ refreshWidget: vi.fn() }))` to that test.

- [ ] **Step 5: Commit** — `git add mobile/src/lib/widget-refresh.ts mobile/src/lib/auth-context.tsx mobile/src/lib/auth-context.test.ts "mobile/src/app/(app)/index.tsx"` (plus `mobile/src/lib/payments-screen.test.ts` if changed) then `git commit -S -m "feat(mobile): redraw the widget after loading payments and on sign-out"`.

---

### Task 6: Build and test on the device (owner)

- [ ] **Step 1:** from `mobile/` on `feature/home-widget`: `eas build -p android --profile preview`. Install the APK.
- [ ] **Step 2:** long-press the home screen, Widgets, Payment Tracker, add "Upcoming payments".
- [ ] **Step 3:** check:
  - rows match the Payments tab (overdue red on top, then the next 7 days),
  - tapping a row opens the Payments tab on that month,
  - marking a payment paid in the app removes it from the widget within seconds,
  - signing out shows "Sign in", signing back in and opening Payments refills it,
  - with airplane mode on, the widget keeps the last list and its time after the 30-minute refresh.
- [ ] **Step 4:** report any failure with a screenshot; fixes go in new commits.

---

## Self-review notes

- Spec coverage: content and order (Task 2), sign-in/error/empty states and cache (Tasks 3–4), deep link (Tasks 2, 4), refresh triggers (Tasks 4–5), version bump and plugin (Task 4), tests (Tasks 1–3, 5), device checks (Task 6).
- `selectWidgetItems` drops the spec's separate overdue lookback limit: Task 3 only feeds it the previous, current and next month, which enforces it.
