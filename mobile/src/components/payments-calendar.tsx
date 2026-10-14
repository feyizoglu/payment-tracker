import { useLang } from "@ptracker/shared/i18n";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { buildCalendarWeeks, weekdayLabels } from "@/lib/calendar";
import { dayKey, groupOccurrencesByDay, occurrenceKey } from "@/lib/occurrences";
import { OccurrenceRow } from "@/components/occurrence-row";
import { personColor, type People } from "@/lib/people";

export function PaymentsCalendar({
  year,
  month,
  occurrences,
  people,
  selectedDay,
  onSelectDay,
  busyKey,
  onTogglePaid,
  onEdit,
  onEditSeries,
}: {
  year: number;
  month: number; // 0-indexed
  occurrences: Occurrence[];
  people: People;
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  busyKey: string | null;
  onTogglePaid: (o: Occurrence) => void;
  onEdit: (o: Occurrence) => void;
  onEditSeries: (o: Occurrence) => void;
}) {
  const { t, lang } = useLang();
  const weekdays = useMemo(() => weekdayLabels(lang), [lang]);
  const weeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const g of groupOccurrencesByDay(occurrences)) map.set(dayKey(g.date), g.items);
    return map;
  }, [occurrences]);

  const todayKey = dayKey(new Date());
  const selectedKey = selectedDay ? dayKey(selectedDay) : null;
  const selectedItems = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  return (
    <View className="p-4">
      <View className="flex-row">
        {weekdays.map((d) => (
          <Text key={d} className="flex-1 text-center text-xs text-gray-400">{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((day) => {
            const inMonth = day.getMonth() === month;
            const items = byDay.get(dayKey(day)) ?? [];
            const selected = selectedKey === dayKey(day);
            const isToday = todayKey === dayKey(day);
            return (
              <Pressable
                key={dayKey(day)}
                disabled={!inMonth}
                onPress={() => onSelectDay(day)}
                className={`h-12 flex-1 items-center justify-center ${selected ? "rounded-lg bg-blue-50" : ""}`}>
                <View className={`h-6 w-6 items-center justify-center rounded-full ${isToday ? "bg-brand" : ""}`}>
                  <Text
                    className={`text-sm ${
                      isToday
                        ? "font-semibold text-brand-fg"
                        : `${inMonth ? "text-gray-800" : "text-gray-300"} ${selected ? "font-semibold text-blue-600" : ""}`
                    }`}>
                    {day.getDate()}
                  </Text>
                </View>
                <View className="mt-0.5 h-1.5 flex-row gap-0.5">
                  {items.slice(0, 4).map((o) => (
                    <View
                      key={occurrenceKey(o)}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: o.isPaid ? "#86EFAC" : personColor(people, o.user_id) }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {selectedDay ? (
        <View className="mt-4 gap-2">
          {selectedItems.length === 0 ? (
            <Text className="text-center text-sm text-gray-400">{t.noPaymentsThisDay}</Text>
          ) : (
            selectedItems.map((o) => (
              <OccurrenceRow
                key={occurrenceKey(o)}
                occurrence={o}
                people={people}
                busy={busyKey === occurrenceKey(o)}
                onTogglePaid={onTogglePaid}
                onEdit={onEdit}
                onEditSeries={onEditSeries}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
