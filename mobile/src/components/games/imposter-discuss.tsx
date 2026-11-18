import { useEffect, useRef, useState } from "react";
import { Text, Vibration, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, formatCountdown, remainingSeconds } from "@ptracker/shared/imposter";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useGameOnScreen } from "@/lib/use-game-on-screen";

export function ImposterDiscuss({
  starter,
  starterColor,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  starterColor: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
  const { t } = useLang();
  const onScreen = useGameOnScreen();
  // pausedAt is when the clock stopped for the game going off screen; the time away moves endsAt.
  const [clock, setClock] = useState<{ endsAt: number; pausedAt: number | null }>(() => ({
    endsAt: Date.now() + timerMinutes * 60_000,
    pausedAt: null,
  }));
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef(false);

  useEffect(() => {
    if (timerMinutes === 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timerMinutes]);

  useEffect(() => {
    if (timerMinutes === 0) return;
    const at = Date.now();
    if (!onScreen) setClock((c) => (c.pausedAt === null ? { ...c, pausedAt: at } : c));
    else setClock((c) => (c.pausedAt === null ? c : { endsAt: c.endsAt + Math.max(0, at - c.pausedAt), pausedAt: null }));
  }, [onScreen, timerMinutes]);

  const left = remainingSeconds(clock.endsAt, clock.pausedAt ?? now);

  useEffect(() => {
    if (timerMinutes > 0 && left === 0 && !buzzed.current) {
      buzzed.current = true;
      Vibration.vibrate(800);
    }
  }, [left, timerMinutes]);

  return (
    <View className="items-center gap-6 py-10">
      <View className="rounded-full px-5 py-2" style={{ backgroundColor: starterColor }}>
        <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
          {t.imposterStarts.replace("{name}", () => starter)}
        </Text>
      </View>
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
