import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/lib/language-storage", () => ({ getStoredLanguage: vi.fn() }));
vi.mock("@/lib/widget-data", () => ({ loadWidgetData: vi.fn(), nativeWidgetDeps: vi.fn() }));
vi.mock("@/widget/upcoming-payments-widget", () => ({ UpcomingPaymentsWidget: vi.fn(() => null) }));

import { getStoredLanguage } from "@/lib/language-storage";
import { loadWidgetData, nativeWidgetDeps, type WidgetDeps, type WidgetState } from "@/lib/widget-data";
import { UpcomingPaymentsWidget } from "@/widget/upcoming-payments-widget";
import { renderWidgetState, widgetTaskHandler } from "@/widget/task-handler";

type HandlerProps = Parameters<typeof widgetTaskHandler>[0];
type WidgetProps = { state: WidgetState; lang: string; tap: number };

const OK_STATE: WidgetState = { kind: "ok", items: [], moreCount: 0, people: {}, updatedAt: "2026-10-16T09:00:00.000Z" };
const DEPS = { getToken: async () => "jwt" } as unknown as WidgetDeps;

const renderWidget = vi.fn();

function handle(widgetAction: HandlerProps["widgetAction"]) {
  return widgetTaskHandler({
    widgetAction,
    widgetInfo: {} as HandlerProps["widgetInfo"],
    renderWidget,
  } as HandlerProps);
}

function rendered(): ReactElement<WidgetProps> {
  expect(renderWidget).toHaveBeenCalledTimes(1);
  return renderWidget.mock.calls[0][0] as ReactElement<WidgetProps>;
}

beforeEach(() => {
  renderWidget.mockReset();
  vi.mocked(nativeWidgetDeps).mockReset();
  vi.mocked(nativeWidgetDeps).mockReturnValue(DEPS);
  vi.mocked(loadWidgetData).mockReset();
  vi.mocked(loadWidgetData).mockResolvedValue(OK_STATE);
  vi.mocked(getStoredLanguage).mockReset();
  vi.mocked(getStoredLanguage).mockResolvedValue("en");
});

describe("widgetTaskHandler", () => {
  it.each(["WIDGET_ADDED", "WIDGET_UPDATE", "WIDGET_RESIZED"] as const)(
    "renders the loaded state in the stored language on %s",
    async (action) => {
      await handle(action);
      const element = rendered();
      expect(element.type).toBe(UpcomingPaymentsWidget);
      expect(element.props.state).toBe(OK_STATE);
      expect(element.props.lang).toBe("en");
      expect(loadWidgetData).toHaveBeenCalledWith(DEPS);
    }
  );

  it.each(["WIDGET_CLICK", "WIDGET_DELETED"] as const)("neither loads nor renders on %s", async (action) => {
    await handle(action);
    expect(renderWidget).not.toHaveBeenCalled();
    expect(loadWidgetData).not.toHaveBeenCalled();
  });

  it("renders the error state in Turkish when the widget deps cannot be built", async () => {
    vi.mocked(nativeWidgetDeps).mockImplementation(() => {
      throw new Error("EXPO_PUBLIC_API_URL is not set");
    });
    await handle("WIDGET_UPDATE");
    const element = rendered();
    expect(element.type).toBe(UpcomingPaymentsWidget);
    expect(element.props.state).toEqual({ kind: "error" });
    expect(element.props.lang).toBe("tr");
  });
});

describe("renderWidgetState", () => {
  it("falls back to Turkish when no language is stored", async () => {
    vi.mocked(getStoredLanguage).mockResolvedValue(null);
    const element = (await renderWidgetState()) as ReactElement<WidgetProps>;
    expect(element.props.lang).toBe("tr");
  });
});
