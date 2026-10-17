import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventDetail, EventExpense } from "@/types";
import { LanguageProvider } from "@/lib/i18n";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));

import ExpenseForm from "@/components/events/ExpenseForm";

const participant = (id: string, display_name: string) => ({
  id,
  event_id: "e1",
  user_id: null,
  display_name,
  created_at: "",
});

const event = {
  id: "e1",
  name: "Trip",
  event_date: null,
  created_by: "u1",
  status: "open",
  created_at: "",
  participants: [participant("p1", "Ann"), participant("p2", "Ben"), participant("p3", "Cem")],
  expenses: [],
  settlements: [],
} as unknown as EventDetail;

function expense(amount_minor: number, shares: [string, number][]): EventExpense {
  return {
    id: "x1",
    event_id: "e1",
    description: "Dinner",
    amount_minor,
    currency: "TRY",
    paid_by: "p1",
    spent_on: "2026-10-16",
    created_by: "u1",
    created_at: "",
    shares: shares.map(([participant_id, amount]) => ({ participant_id, amount_minor: amount })),
  };
}

function render(stored: EventExpense): string {
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      { initialLang: "en" },
      createElement(ExpenseForm, { event, expense: stored, onDone: () => {}, onCancel: () => {} })
    )
  );
}

const exactInputs = (html: string) => [...html.matchAll(/placeholder="0" class="w-28[^"]*" value="([^"]*)"/g)].map((m) => m[1]);
const checkboxes = (html: string) => [...html.matchAll(/<input type="checkbox"( checked="")?/g)].map((m) => m[1] !== undefined);

describe("ExpenseForm edit mode", () => {
  it("opens an unequal stored split in exact mode with the stored shares prefilled", () => {
    const html = render(expense(300, [["p1", 200], ["p2", 100]]));
    expect(checkboxes(html)).toEqual([]);
    expect(exactInputs(html)).toEqual(["2", "1", ""]);
  });

  it("opens an equal split over a subset in equal mode with only that subset checked", () => {
    const html = render(expense(200, [["p1", 100], ["p3", 100]]));
    expect(exactInputs(html)).toEqual([]);
    expect(checkboxes(html)).toEqual([true, false, true]);
  });
});
