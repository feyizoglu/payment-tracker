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

async function signedOut(deps: WidgetDeps): Promise<WidgetState> {
  await deps.clearCache().catch(() => undefined);
  return { kind: "signed-out" };
}

export async function loadWidgetData(deps: WidgetDeps): Promise<WidgetState> {
  try {
    if (!(await deps.getToken())) return signedOut(deps);
    const [payments, recurrings, teams] = await Promise.all([
      deps.get<Payment[]>("/api/payments?filter=all"),
      deps.get<RecurringPayment[]>("/api/recurring?filter=all"),
      deps.get<Team[]>("/api/teams").catch(() => [] as Team[]),
    ]);
    // Signed out while the fetch was in flight: don't cache the previous user's payments.
    if (!(await deps.getToken())) return signedOut(deps);
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
    if (e instanceof ApiError && e.status === 401) return signedOut(deps);
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
