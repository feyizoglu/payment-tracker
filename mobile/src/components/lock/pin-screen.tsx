import { checkPin, lockoutRemaining, type AppLockState } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { inputBoxClass } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAppLock } from "@/lib/app-lock-context";
import { sha256Hex } from "@/lib/app-lock-storage";
import { useAuth } from "@/lib/auth-context";

// Checks the PIN and saves the attempt count; `onUnlock` gets the updated state so the
// caller applies its own change (exit game mode, …) on top.
export function PinScreen({
  title,
  description,
  onUnlock,
  showForgot = true,
  autoFocus = true,
}: {
  title: string;
  description?: string;
  onUnlock: (state: AppLockState) => void | Promise<void>;
  showForgot?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const { signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.ceil(lockoutRemaining(lock, now) / 1000);

  useEffect(() => {
    if (lock.lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lock.lockedUntil]);

  async function submit() {
    const at = Date.now();
    setNow(at);
    const result = await checkPin(lock, pin, at, sha256Hex);
    setPin("");
    if (result.ok) {
      setError(null);
      await onUnlock(result.state);
      return;
    }
    await update(result.state);
    setError(t.pinWrong);
  }

  return (
    <View className="gap-5 px-2 py-10">
      <View className="items-center gap-1">
        <Text className="text-4xl">🔒</Text>
        <Text className="text-center text-xl font-bold text-gray-900">{title}</Text>
        {description ? <Text className="text-center text-sm text-gray-500">{description}</Text> : null}
      </View>
      <TextInput
        className={`${inputBoxClass} text-center text-lg tracking-widest`}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
        placeholder={t.pinEnter}
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        editable={wait === 0}
        autoFocus={autoFocus}
      />
      {wait > 0 ? (
        <Text className="text-center text-sm text-amber-700">{t.pinLockedOut.replace("{s}", String(wait))}</Text>
      ) : error ? (
        <Text className="text-center text-sm text-red-600">{error}</Text>
      ) : null}
      <PrimaryButton label={t.pinUnlock} onPress={submit} disabled={wait > 0 || pin.length < 4} />
      {showForgot ? (
        <Pressable onPress={() => void signOut()} className="py-2">
          <Text className="text-center text-sm text-gray-500 underline">{t.pinForgot}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
