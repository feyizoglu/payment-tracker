import { Pressable, Text, View } from "react-native";
import { formatMonthYear } from "@/lib/calendar";

export type PaymentsView = "list" | "calendar";

export function MonthHeader({
  year,
  month,
  view,
  onPrev,
  onNext,
  onToggleView,
}: {
  year: number;
  month: number; // 0-indexed
  view: PaymentsView;
  onPrev: () => void;
  onNext: () => void;
  onToggleView: (v: PaymentsView) => void;
}) {
  return (
    <View className="border-b border-gray-100 bg-white px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onPrev} className="px-3 py-1">
          <Text className="text-xl text-gray-600">‹</Text>
        </Pressable>
        <Text className="text-base font-semibold text-gray-900">
          {formatMonthYear(year, month)}
        </Text>
        <Pressable onPress={onNext} className="px-3 py-1">
          <Text className="text-xl text-gray-600">›</Text>
        </Pressable>
      </View>
      <View className="mt-3 flex-row self-center rounded-lg bg-gray-100 p-0.5">
        {(["list", "calendar"] as const).map((v) => (
          <Pressable key={v} onPress={() => onToggleView(v)} className={`rounded-md px-4 py-1 ${view === v ? "bg-white" : ""}`}>
            <Text className={view === v ? "font-medium text-gray-900" : "text-gray-500"}>
              {v === "list" ? "Liste" : "Takvim"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
