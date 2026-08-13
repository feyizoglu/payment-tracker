import { getCurrencySymbol } from "@ptracker/shared/payments";
import type { Occurrence } from "@ptracker/shared/types";
import { useLang } from "@ptracker/shared/i18n";
import { Text, View } from "react-native";

import { formatDayShort } from "@/lib/calendar";
import { occurrenceTypeBadge } from "@/lib/occurrences";

// Read-only occurrence row for the report lists. Deliberately not OccurrenceRow: that
// one carries mark-paid and edit actions, which a report must not offer.
export function ReportRow({ occurrence, paidLabel }: { occurrence: Occurrence; paidLabel: string }) {
  const { t, lang } = useLang();
  const o = occurrence;
  return (
    <View
      className={`flex-row items-center gap-3 rounded-xl border p-3 ${
        o.isPaid ? "border-green-100 bg-green-50" : "border-gray-100 bg-white"
      }`}>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className={`flex-shrink font-medium ${o.isPaid ? "text-gray-400 line-through" : "text-gray-800"}`}
            numberOfLines={1}>
            {o.name}
          </Text>
          {o.isPaid ? (
            <Text className="rounded-full bg-green-100 px-1.5 text-[10px] text-green-600">{paidLabel}</Text>
          ) : null}
        </View>
        <Text className="mt-0.5 text-xs text-gray-400">
          {formatDayShort(o.dueDate, lang)} · {occurrenceTypeBadge(o, t.monthly)}
        </Text>
      </View>

      <Text className={`font-semibold ${o.isPaid ? "text-gray-400" : "text-gray-900"}`}>
        {o.amount == null ? "—" : `${getCurrencySymbol(o.currency)}${o.amount}`}
      </Text>
    </View>
  );
}
