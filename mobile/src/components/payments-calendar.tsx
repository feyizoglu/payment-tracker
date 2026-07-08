import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { buildCalendarWeeks } from "@/lib/calendar";
import { dayKey, groupOccurrencesByDay, occurrenceKey } from "@/lib/occurrences";
import { OccurrenceRow } from "@/components/occurrence-row";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function PaymentsCalendar({
  year,
  month,
  occurrences,
  selectedDay,
  onSelectDay,
  busyKey,
  onTogglePaid,
}: {
  year: number;
  month: number; // 0-indexed
  occurrences: Occurrence[];
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  busyKey: string | null;
  onTogglePaid: (o: Occurrence) => void;
}) {
  const weeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const g of groupOccurrencesByDay(occurrences)) map.set(dayKey(g.date), g.items);
    return map;
  }, [occurrences]);

  const selectedKey = selectedDay ? dayKey(selectedDay) : null;
  const selectedItems = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  return (
    <View className="p-4">
      <View className="flex-row">
        {WEEKDAYS.map((d) => (
          <Text key={d} className="flex-1 text-center text-xs text-gray-400">{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((day) => {
            const inMonth = day.getMonth() === month;
            const has = byDay.has(dayKey(day));
            const selected = selectedKey === dayKey(day);
            return (
              <Pressable
                key={dayKey(day)}
                disabled={!inMonth}
                onPress={() => onSelectDay(day)}
                className={`h-12 flex-1 items-center justify-center ${selected ? "rounded-lg bg-blue-50" : ""}`}>
                <Text className={`text-sm ${inMonth ? "text-gray-800" : "text-gray-300"} ${selected ? "font-semibold text-blue-600" : ""}`}>
                  {day.getDate()}
                </Text>
                {has ? <View className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" /> : <View className="mt-0.5 h-1.5" />}
              </Pressable>
            );
          })}
        </View>
      ))}

      {selectedDay ? (
        <View className="mt-4 gap-2">
          {selectedItems.length === 0 ? (
            <Text className="text-center text-sm text-gray-400">Bu gün ödeme yok</Text>
          ) : (
            selectedItems.map((o) => (
              <OccurrenceRow
                key={occurrenceKey(o)}
                occurrence={o}
                busy={busyKey === occurrenceKey(o)}
                onTogglePaid={onTogglePaid}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
