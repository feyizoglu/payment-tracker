import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const platform = vi.hoisted(() => ({ os: "android" }));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return platform.os;
    },
  },
}));
vi.mock("react-native-android-widget", () => ({
  FlexWidget: () => null,
  TextWidget: () => null,
  requestWidgetUpdate: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("./storage", () => ({ getToken: vi.fn() }));
vi.mock("./config", () => ({ getApiUrl: () => "https://api.test" }));

import { requestWidgetUpdate } from "react-native-android-widget";
import { renderWidgetState } from "@/widget/task-handler";
import { refreshWidget } from "./widget-refresh";

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  platform.os = "android";
  unhandled.length = 0;
  vi.mocked(requestWidgetUpdate).mockReset();
  vi.mocked(requestWidgetUpdate).mockResolvedValue(undefined);
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

describe("refreshWidget", () => {
  it("asks Android to redraw the upcoming payments widget", () => {
    refreshWidget();
    expect(requestWidgetUpdate).toHaveBeenCalledWith({
      widgetName: "UpcomingPayments",
      renderWidget: renderWidgetState,
    });
  });

  it("does nothing on iOS", () => {
    platform.os = "ios";
    refreshWidget();
    expect(requestWidgetUpdate).not.toHaveBeenCalled();
  });

  it("swallows a failed redraw instead of leaving an unhandled rejection", async () => {
    vi.mocked(requestWidgetUpdate).mockRejectedValue(new Error("widget gone"));
    expect(() => refreshWidget()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(unhandled).toEqual([]);
  });
});
