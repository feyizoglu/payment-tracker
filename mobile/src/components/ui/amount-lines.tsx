import { getCurrencySymbol } from "@ptracker/shared/payments";
import { Pressable, Text, TextInput, View } from "react-native";

import { Field, inputBoxClass } from "@/components/ui/field";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import type { AmountLine } from "@/lib/occurrence-edit";

// Repeatable "currency + amount" rows for a per-occurrence amount override. One row is
// the common case; extra rows let a single occurrence be paid partly in another
// currency, which is what the API's `amounts` array models.
export function AmountLines({
  label,
  lines,
  currencyOptions,
  onChange,
  addLabel,
}: {
  label: string;
  lines: AmountLine[];
  currencyOptions: SelectOption[];
  onChange: (next: AmountLine[]) => void;
  addLabel: string;
}) {
  function update(index: number, patch: Partial<AmountLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <Field label={label}>
      <View className="gap-2">
        {lines.map((line, index) => (
          <View key={index} className="flex-row items-end gap-2">
            <View className="w-32">
              <SelectField
                label=" "
                value={line.currency}
                options={currencyOptions}
                onChange={(currency) => update(index, { currency })}
              />
            </View>
            <TextInput
              className={`${inputBoxClass} flex-1`}
              value={line.amount}
              onChangeText={(amount) => update(index, { amount })}
              placeholder={`${getCurrencySymbol(line.currency)} 0.00`}
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
            {lines.length > 1 ? (
              <Pressable
                className="px-2 py-3"
                onPress={() => onChange(lines.filter((_, i) => i !== index))}>
                <Text className="text-gray-400">✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))}

        <Pressable className="py-1" onPress={() => onChange([...lines, { currency: "TRY", amount: "" }])}>
          <Text className="text-sm text-brand">+ {addLabel}</Text>
        </Pressable>
      </View>
    </Field>
  );
}
