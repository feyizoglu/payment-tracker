import { Pressable, Text, View } from "react-native";

import { Field } from "@/components/ui/field";
import type { SelectOption } from "@/components/ui/select-field";

// Two-or-three-way inline choice (payment type, amount entry mode). Same role as the
// web form's segmented buttons; for longer option lists use SelectField instead.
export function SegmentedToggle({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
  hint?: string;
}) {
  const row = (
    <View className="flex-row rounded-lg border border-gray-200 bg-gray-50 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            className={`flex-1 rounded-md px-3 py-2 ${active ? "bg-surface" : ""}`}
            onPress={() => onChange(option.value)}>
            <Text
              className={`text-center text-sm ${active ? "font-semibold text-gray-900" : "text-gray-500"}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!label) return row;
  return (
    <Field label={label} hint={hint}>
      {row}
    </Field>
  );
}
