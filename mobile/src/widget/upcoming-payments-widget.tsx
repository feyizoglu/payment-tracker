// The library calls widget components as plain functions, outside a React render,
// where the React Compiler's memo cache does not exist.
"use no memo";

import { FlexWidget, TextWidget, type HexColor } from "react-native-android-widget";
import { format, parseISO } from "date-fns";
import { enUS, tr } from "date-fns/locale";
import { getCurrencySymbol } from "@ptracker/shared/payments";
import { translationsFor, type Lang } from "@ptracker/shared/i18n";
import { personColor } from "@/lib/people";
import type { WidgetState } from "@/lib/widget-data";
import { widgetMonthUri } from "@/lib/widget-items";

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
                borderLeftColor: personColor(state.people, item.userId) as HexColor,
                marginBottom: 2,
              }}>
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget
                  text={item.name}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 13, color: item.overdue ? "#DC2626" : "#1F2937" }}
                />
              </FlexWidget>
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
