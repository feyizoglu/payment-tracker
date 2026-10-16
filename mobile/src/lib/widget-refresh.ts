import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { renderWidgetState, WIDGET_NAME } from "@/widget/task-handler";

// Fire and forget: a widget that fails to redraw must never break the screen that asked.
export function refreshWidget(): void {
  if (Platform.OS !== "android") return;
  requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: renderWidgetState }).catch(() => undefined);
}
