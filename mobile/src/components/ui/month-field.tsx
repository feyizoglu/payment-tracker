import { Pressable, Text, View } from "react-native";

import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { formatMonthName } from "@/lib/calendar";
import { parseIsoMonth } from "@/lib/dates";

// Neither platform ships a month-only picker, so this is a year select + a month
// select over a 'yyyy-MM' value. An empty value means "not set" (the optional end
// month), which is why clearing is a first-class action rather than a sentinel option.
export function MonthField({
  label,
  value,
  onChange,
  hint,
  clearLabel,
  yearSpan = 10,
}: {
  label: string;
  value: string; // 'yyyy-MM' | ''
  onChange: (next: string) => void;
  hint?: string;
  clearLabel: string;
  yearSpan?: number;
}) {
  const parsed = parseIsoMonth(value);
  const currentYear = new Date().getFullYear();
  const baseYear = parsed?.year ?? currentYear;

  const years: SelectOption[] = [];
  for (let y = Math.min(baseYear, currentYear); y <= Math.max(baseYear, currentYear) + yearSpan; y++) {
    years.push({ value: String(y), label: String(y) });
  }
  const months: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: formatMonthName(i),
  }));

  // Picking either half of an unset value fills the other from today, so the user never
  // ends up with a half-written month.
  function setYear(year: string) {
    onChange(`${year}-${parsed ? String(parsed.month).padStart(2, "0") : String(new Date().getMonth() + 1).padStart(2, "0")}`);
  }
  function setMonth(month: string) {
    onChange(`${parsed?.year ?? currentYear}-${month}`);
  }

  return (
    <View className="gap-1">
      <View className="flex-row gap-2">
        <View className="flex-1">
          <SelectField
            label={label}
            value={parsed ? String(parsed.year) : ""}
            options={years}
            onChange={setYear}
            hint={hint}
          />
        </View>
        <View className="flex-1">
          <SelectField
            label=" "
            value={parsed ? String(parsed.month).padStart(2, "0") : ""}
            options={months}
            onChange={setMonth}
          />
        </View>
      </View>
      {parsed ? (
        <Pressable onPress={() => onChange("")}>
          <Text className="text-xs text-brand">{clearLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
