import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventDetail } from "@/types";
import { LanguageProvider } from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import Participants from "@/components/events/Participants";

const participant = (id: string, user_id: string, display_name: string) => ({
  id,
  event_id: "e1",
  user_id,
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
  participants: [participant("p1", "u1", "Ann"), participant("p2", "u2", "Ben"), participant("p3", "u3", "Cem")],
  expenses: [],
  settlements: [],
} as unknown as EventDetail;

function render(myId: string | undefined): string {
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      { initialLang: "en" },
      createElement(Participants, { event, myId, editable: true, onChanged: () => {} })
    )
  );
}

const removeButtons = (html: string) => html.match(/class="text-purple-400 hover:text-red-600/g)?.length ?? 0;

describe("Participants remove buttons", () => {
  it("gives a non-creator a remove button only on their own chip", () => {
    const html = render("u2");
    expect(removeButtons(html)).toBe(1);
    expect(html).toMatch(/Ben<button[^>]*class="text-purple-400 hover:text-red-600/);
  });

  it("gives the creator a remove button on every other participant", () => {
    expect(removeButtons(render("u1"))).toBe(2);
  });

  it("gives a signed-out viewer no remove button", () => {
    expect(removeButtons(render(undefined))).toBe(0);
  });
});
