import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { getCurrencySymbol } from "@ptracker/shared/payments";
import { occurrenceTypeBadge } from "@/lib/occurrences";

export function OccurrenceRow({
  occurrence,
  busy,
  onTogglePaid,
}: {
  occurrence: Occurrence;
  busy: boolean;
  onTogglePaid: (o: Occurrence) => void;
}) {
  const o = occurrence;
  return (
    <View
      className={`flex-row items-center gap-3 rounded-xl border p-3 ${
        o.isPaid ? "border-green-100 bg-green-50" : "border-gray-100 bg-white"
      }`}>
      <Pressable disabled={busy} onPress={() => onTogglePaid(o)} className="disabled:opacity-50">
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Text className={o.isPaid ? "text-green-500" : "text-gray-300"}>
            {o.isPaid ? "✓" : "○"}
          </Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Text className={`font-medium ${o.isPaid ? "text-gray-400 line-through" : "text-gray-800"}`}>
          {o.name}
        </Text>
        <Text className="mt-0.5 text-xs text-gray-400">{occurrenceTypeBadge(o)}</Text>
      </View>
      <Text className={`font-semibold ${o.isPaid ? "text-gray-400" : "text-gray-900"}`}>
        {o.amount == null ? "—" : `${getCurrencySymbol(o.currency)}${o.amount}`}
      </Text>
    </View>
  );
}
