import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  ROLE_NAME_KEYS,
  formatCountdown,
  livingSeats,
  playerColor,
  remainingSeconds,
  type GameState,
} from "@ptracker/shared/wolf-game";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { PrimaryButton } from "@/components/ui/primary-button";

// The day: the table talks (with the optional timer), then the phone holder enters the vote.
// The timer counts to the day's end time in the game state, so leaving for the rules does not
// restart it. It does not buzz: the game has no sound or vibration.
export function WolfDay({
  state,
  onVote,
  onTalk,
  onVoteOut,
  onRules,
}: {
  state: GameState;
  onVote: () => void;
  onTalk: () => void;
  onVoteOut: (seat: number | null) => void;
  onRules: () => void;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  const ticking = state.setup.timerMinutes > 0 && state.dayStep === "talk";

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);

  const names = state.setup.players;
  const living = livingSeats(state);
  const ink = { color: GAME_THEME.ink };

  if (state.dayStep === "vote") {
    return (
      <View className="gap-5">
        <Text className="text-center text-xl font-bold text-gray-900">{t.wolfVoteQuestion}</Text>
        <WolfPicker
          options={living.map((seat) => ({ seat, enabled: true }))}
          names={names}
          selected={null}
          onPick={onVoteOut}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => onVoteOut(null)}
          className="rounded-xl border-2 border-gray-200 py-3">
          <Text className="text-center text-base font-semibold text-gray-900">{t.wolfNobody}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onTalk} className="py-2">
          <Text className="text-center text-sm text-gray-500">{t.back}</Text>
        </Pressable>
      </View>
    );
  }

  const left = remainingSeconds(state.dayEndsAt, now);
  const out = names.flatMap((_, seat) => (state.alive[seat] ? [] : [seat]));

  return (
    <View className="gap-5">
      <WolfRulesButton onPress={onRules} />
      <Text className="text-center text-2xl font-bold text-gray-900">
        {t.wolfDayN.replace("{n}", String(state.night?.number ?? 1))}
      </Text>
      {state.setup.timerMinutes > 0 ? (
        <Text className={`text-center text-5xl font-semibold ${left === 0 ? "text-red-600" : "text-gray-900"}`}>
          {left === 0 ? t.imposterTimeUp : formatCountdown(left)}
        </Text>
      ) : null}
      <View className="gap-2">
        <Text className="text-sm font-medium text-gray-500">{t.wolfInGame}</Text>
        <View className="flex-row flex-wrap gap-2">
          {living.map((seat) => (
            <View key={seat} className="rounded-full px-3 py-1" style={{ backgroundColor: playerColor(seat) }}>
              <Text className="text-base font-semibold" style={ink}>
                {names[seat]}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {out.length > 0 ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-500">{t.wolfOut}</Text>
          <View className="flex-row flex-wrap gap-2">
            {out.map((seat) => (
              <View key={seat} className="rounded-full px-3 py-1 opacity-60" style={{ backgroundColor: playerColor(seat) }}>
                <Text className="text-base" style={ink}>
                  <Text style={{ textDecorationLine: "line-through" }}>{names[seat]}</Text>
                  {state.setup.showRoles ? ` · ${t[ROLE_NAME_KEYS[state.roles[seat]]]}` : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <PrimaryButton label={t.wolfVote} onPress={onVote} />
    </View>
  );
}
