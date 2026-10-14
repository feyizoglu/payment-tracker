import { useLang } from "@ptracker/shared/i18n";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { getCurrencySymbol } from "@ptracker/shared/payments";
import { occurrenceTypeBadge } from "@/lib/occurrences";
import { personColor, type People } from "@/lib/people";

export function OccurrenceRow({
  occurrence,
  people,
  busy,
  onTogglePaid,
  onEdit,
  onEditSeries,
}: {
  occurrence: Occurrence;
  people: People;
  busy: boolean;
  onTogglePaid: (o: Occurrence) => void;
  onEdit?: (o: Occurrence) => void;
  onEditSeries?: (o: Occurrence) => void;
}) {
  const { t } = useLang();
  const o = occurrence;
  const color = personColor(people, o.user_id);
  const owner = people[o.user_id];
  return (
    // Long-press opens the whole series; the pencil edits just this occurrence.
    <Pressable
      onLongPress={onEditSeries ? () => onEditSeries(o) : undefined}
      className={`flex-row items-center gap-3 rounded-xl border p-3 ${
        o.isPaid ? "border-green-100 bg-green-50" : "border-gray-100 bg-surface"
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: color }}>
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
        <View className="mt-0.5 flex-row items-center gap-1">
          <Text className="text-xs text-gray-400">{occurrenceTypeBadge(o, t.monthly)}</Text>
          {owner ? (
            <>
              <Text className="text-xs text-gray-400">·</Text>
              <View className="h-3.5 w-3.5 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
                <Text className="text-[8px] font-bold text-white">{owner.name[0]?.toUpperCase()}</Text>
              </View>
              <Text className="shrink text-xs text-gray-400" numberOfLines={1}>
                {owner.name}
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <Text className={`font-semibold ${o.isPaid ? "text-gray-400" : "text-gray-900"}`}>
        {o.amount == null ? "—" : `${getCurrencySymbol(o.currency)}${o.amount}`}
      </Text>
      {onEdit ? (
        <Pressable onPress={() => onEdit(o)} className="pl-1">
          <Text className="text-gray-300">✎</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
