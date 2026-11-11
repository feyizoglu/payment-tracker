import { useEffect, useRef, useState } from "react";
import { Text, Vibration, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { formatCountdown, remainingSeconds } from "@ptracker/shared/imposter";
import { PrimaryButton } from "@/components/ui/primary-button";

export function ImposterDiscuss({
  starter,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
  const { t } = useLang();
  const [endsAt] = useState(() => Date.now() + timerMinutes * 60_000);
  const [left, setLeft] = useState(timerMinutes * 60);
  const buzzed = useRef(false);

  useEffect(() => {
    if (timerMinutes === 0) return;
    const id = setInterval(() => setLeft(remainingSeconds(endsAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [endsAt, timerMinutes]);

  useEffect(() => {
    if (timerMinutes > 0 && left === 0 && !buzzed.current) {
      buzzed.current = true;
      Vibration.vibrate(800);
    }
  }, [left, timerMinutes]);

  return (
    <View className="items-center gap-6 py-10">
      <Text className="text-center text-2xl font-bold text-gray-900">{t.imposterStarts.replace("{name}", starter)}</Text>
      {timerMinutes > 0 ? (
        <Text className={`text-5xl font-semibold ${left === 0 ? "text-red-600" : "text-gray-900"}`}>
          {left === 0 ? t.imposterTimeUp : formatCountdown(left)}
        </Text>
      ) : null}
      <View className="w-full">
        <PrimaryButton label={voting ? t.imposterGoVote : t.imposterReveal} onPress={onFinish} />
      </View>
    </View>
  );
}
