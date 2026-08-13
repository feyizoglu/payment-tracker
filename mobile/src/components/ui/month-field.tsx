import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";

import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { formatMonthName } from "@/lib/calendar";
import {
  monthPickerYears,
  parseIsoMonth,
  withMonthPickerMonth,
  withMonthPickerYear,
} from "@/lib/dates";

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
  const { lang } = useLang();
  const parsed = parseIsoMonth(value);
  const today = new Date();

  const years: SelectOption[] = monthPickerYears(value, today, yearSpan).map((year) => ({
    value: String(year),
    label: String(year),
  }));
  const months: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: formatMonthName(i, lang),
  }));

  return (
    <View className="gap-1">
      <View className="flex-row gap-2">
        <View className="flex-1">
          <SelectField
            label={label}
            value={parsed ? String(parsed.year) : ""}
            options={years}
            onChange={(year) => onChange(withMonthPickerYear(value, year, today))}
            hint={hint}
          />
        </View>
        <View className="flex-1">
          <SelectField
            label=" "
            value={parsed ? String(parsed.month).padStart(2, "0") : ""}
            options={months}
            onChange={(month) => onChange(withMonthPickerMonth(value, month, today))}
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
