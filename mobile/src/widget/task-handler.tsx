import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { getStoredLanguage } from "@/lib/language-storage";
import { loadWidgetData, nativeWidgetDeps } from "@/lib/widget-data";
import { UpcomingPaymentsWidget } from "./upcoming-payments-widget";

export const WIDGET_NAME = "UpcomingPayments";

export async function renderWidgetState() {
  const [state, lang] = await Promise.all([loadWidgetData(nativeWidgetDeps()), getStoredLanguage()]);
  return <UpcomingPaymentsWidget state={state} lang={lang ?? "tr"} tap={Date.now()} />;
}

export async function widgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_ADDED" || widgetAction === "WIDGET_UPDATE" || widgetAction === "WIDGET_RESIZED") {
    try {
      renderWidget(await renderWidgetState());
    } catch {
      renderWidget(<UpcomingPaymentsWidget state={{ kind: "error" }} lang="tr" tap={0} />);
    }
  }
}
