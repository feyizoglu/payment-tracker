import { Fragment } from "react";
import { Text, View } from "react-native";
import type { Occurrence } from "@ptracker/shared/types";
import { groupOccurrencesByDay, occurrenceKey } from "@/lib/occurrences";
import { OccurrenceRow } from "@/components/occurrence-row";

const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function MonthList({
  occurrences,
  busyKey,
  onTogglePaid,
}: {
  occurrences: Occurrence[];
  busyKey: string | null;
  onTogglePaid: (o: Occurrence) => void;
}) {
  const groups = groupOccurrencesByDay(occurrences);
  if (groups.length === 0) {
    return <Text className="p-6 text-center text-gray-500">Bu ay ödeme yok</Text>;
  }
  return (
    <View className="gap-4 p-4">
      {groups.map((g) => (
        <Fragment key={g.key}>
          <Text className="text-xs font-semibold text-gray-400">
            {g.date.getDate()} {TR_MONTHS_SHORT[g.date.getMonth()]}
          </Text>
          <View className="gap-2">
            {g.items.map((o) => (
              <OccurrenceRow
                key={occurrenceKey(o)}
                occurrence={o}
                busy={busyKey === occurrenceKey(o)}
                onTogglePaid={onTogglePaid}
              />
            ))}
          </View>
        </Fragment>
      ))}
    </View>
  );
}
