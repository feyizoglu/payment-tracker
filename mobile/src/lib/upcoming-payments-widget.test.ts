import { describe, it, expect, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

vi.mock("react-native-android-widget", () => ({
  FlexWidget: () => null,
  TextWidget: () => null,
}));

import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { Lang } from "@ptracker/shared/i18n";
import type { WidgetState } from "./widget-data";
import type { WidgetItem } from "./widget-items";
import { UpcomingPaymentsWidget } from "@/widget/upcoming-payments-widget";

type Props = Record<string, unknown> & { children?: ReactNode };

function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  if (node.type === FlexWidget) return [node, ...elements(node.props.children)];
  if (node.type === TextWidget) return [node];
  const component = node.type as (props: Props) => ReactNode;
  return elements(component(node.props));
}

function texts(node: ReactNode): string[] {
  return elements(node)
    .filter((el) => el.type === TextWidget)
    .map((el) => el.props.text as string);
}

function render(state: WidgetState, lang: Lang = "en", tap = 7) {
  return UpcomingPaymentsWidget({ state, lang, tap });
}

function ok(items: WidgetItem[], moreCount = 0): WidgetState {
  return { kind: "ok", items, moreCount, people: {}, updatedAt: "2026-10-16T09:00:00.000Z" };
}

const RENT: WidgetItem = {
  key: "r1-2026-10",
  name: "Rent",
  dueDate: "2026-10-18",
  amount: 1500,
  currency: "USD",
  userId: "u1",
  overdue: false,
};
const GYM: WidgetItem = {
  key: "p2",
  name: "Gym",
  dueDate: "2026-11-02",
  amount: null,
  currency: "TRY",
  userId: "u1",
  overdue: false,
};

describe("UpcomingPaymentsWidget state notes", () => {
  it("asks a signed-out user to sign in", () => {
    expect(texts(render({ kind: "signed-out" }))).toContain("Sign in to see your payments");
  });

  it("says the refresh failed on an error", () => {
    expect(texts(render({ kind: "error" }))).toContain("Couldn't refresh");
  });

  it("says nothing is due when the ok state has no items", () => {
    expect(texts(render(ok([])))).toContain("Nothing due in the next 7 days");
  });
});

describe("UpcomingPaymentsWidget item rows", () => {
  function rows(lang: Lang) {
    return elements(render(ok([RENT, GYM]), lang, 42)).filter(
      (el) => el.type === FlexWidget && el.props.clickAction === "OPEN_URI"
    );
  }

  it("opens each row's due month on tap", () => {
    expect(rows("en").map((row) => (row.props.clickActionData as { uri: string }).uri)).toEqual([
      "paymenttracker:///?month=2026-10&tap=42",
      "paymenttracker:///?month=2026-11&tap=42",
    ]);
  });

  it("shows the name, the English date and the amount, with a dash for a null amount", () => {
    expect(rows("en").map((row) => texts(row))).toEqual([
      ["Rent", "18 Oct", "$1500"],
      ["Gym", "2 Nov", "—"],
    ]);
  });

  it("localizes the date in Turkish", () => {
    expect(rows("tr").map((row) => texts(row)[1])).toEqual(["18 Eki", "2 Kas"]);
  });
});

describe("UpcomingPaymentsWidget more footer", () => {
  it("counts the payments that did not fit", () => {
    expect(texts(render(ok([RENT], 2)))).toContain("+2 more");
  });
});
