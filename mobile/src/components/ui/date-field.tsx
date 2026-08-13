import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { Field, inputBoxClass } from "@/components/ui/field";
import { fromIsoDate, toIsoDate } from "@/lib/dates";

// Date input speaking 'yyyy-MM-dd' in and out. The native picker is mounted only while
// open: on Android it *is* the dialog, so leaving it mounted would reopen it.
export function DateField({
  label,
  value,
  onChange,
  hint,
  formatValue,
}: {
  label: string;
  value: string; // 'yyyy-MM-dd'
  onChange: (next: string) => void;
  hint?: string;
  formatValue?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);

  function handleChange(event: DateTimePickerEvent, picked?: Date) {
    setOpen(false);
    // Android reports a cancelled dialog as "dismissed" and still passes the old date.
    if (event.type === "dismissed" || !picked) return;
    onChange(toIsoDate(picked));
  }

  return (
    <Field label={label} hint={hint}>
      <Pressable className={`${inputBoxClass} flex-row items-center justify-between`} onPress={() => setOpen(true)}>
        <Text className="text-base text-gray-900">{formatValue ? formatValue(value) : value}</Text>
        <Text className="text-xs text-gray-400">📅</Text>
      </Pressable>
      {open ? (
        <DateTimePicker value={fromIsoDate(value)} mode="date" display="default" onChange={handleChange} />
      ) : null}
    </Field>
  );
}
