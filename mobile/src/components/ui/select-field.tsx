import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Field, inputBoxClass } from "@/components/ui/field";

export interface SelectOption {
  value: string;
  label: string;
}

// React Native has no native <select>, so the closed state is a Pressable that looks
// like an input and the open state is a bottom sheet of options.
export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  placeholder = "—",
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Field label={label} hint={hint}>
      <Pressable className={`${inputBoxClass} flex-row items-center justify-between`} onPress={() => setOpen(true)}>
        <Text className={selected ? "text-base text-gray-900" : "text-base text-gray-400"}>
          {selected?.label ?? placeholder}
        </Text>
        <Text className="text-xs text-gray-400">▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          {/* Swallows the press so tapping inside the sheet doesn't close it. */}
          <Pressable className="max-h-96 rounded-t-2xl bg-surface pb-6 pt-2" onPress={() => {}}>
            <View className="mb-2 h-1 w-10 self-center rounded-full bg-gray-200" />
            <Text className="px-4 pb-2 text-xs font-medium text-gray-500">{label}</Text>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  className="flex-row items-center justify-between px-4 py-3"
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}>
                  <Text
                    className={
                      option.value === value ? "text-base font-semibold text-brand" : "text-base text-gray-800"
                    }>
                    {option.label}
                  </Text>
                  {option.value === value ? <Text className="text-brand">✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Field>
  );
}
