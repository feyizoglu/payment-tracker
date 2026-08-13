import { TextInput } from "react-native";

import { Field, inputBoxClass } from "@/components/ui/field";

// Single-line text/number input. `numeric` swaps the keyboard only — the value stays a
// string, and parsing/validation belongs to the caller's lib helper, because the
// numeric keyboard still lets the user type "1.2.3" on some devices.
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  numeric = false,
  autoFocus = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  hint?: string;
  numeric?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        className={`${inputBoxClass} ${editable ? "" : "bg-gray-50 text-gray-400"}`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoFocus={autoFocus}
        editable={editable}
      />
    </Field>
  );
}
