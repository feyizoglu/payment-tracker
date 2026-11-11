import { isValidPin } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Field, inputBoxClass } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PinSetup({ onDone }: { onDone: (pin: string) => Promise<void> }) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isValidPin(pin)) return setError(t.pinInvalid);
    if (pin !== repeat) return setError(t.pinMismatch);
    setBusy(true);
    setError(null);
    try {
      await onDone(pin);
    } catch {
      setError(t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  return (
    <View className="gap-3">
      <Field label={t.pinNew}>
        <TextInput
          className={`${inputBoxClass} text-center tracking-widest`}
          value={pin}
          onChangeText={(v) => setPin(digits(v))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </Field>
      <Field label={t.pinRepeat}>
        <TextInput
          className={`${inputBoxClass} text-center tracking-widest`}
          value={repeat}
          onChangeText={(v) => setRepeat(digits(v))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </Field>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <PrimaryButton label={t.pinSave} onPress={submit} busy={busy} />
    </View>
  );
}
