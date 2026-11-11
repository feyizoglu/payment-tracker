import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import type { GameState } from "@ptracker/shared/imposter";
import { PrimaryButton } from "@/components/ui/primary-button";

export function ImposterResult({
  state,
  onNextRound,
  onEnd,
}: {
  state: GameState;
  onNextRound: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  const { round, outcome, setup, scores } = state;
  if (!round) return null;
  const names = setup.players;

  return (
    <View className="gap-5">
      {outcome ? (
        <View className="items-center gap-1">
          <Text className="text-sm text-gray-500">
            {outcome.accused === null ? t.imposterTie : t.imposterAccused.replace("{name}", names[outcome.accused])}
          </Text>
          <Text className={`text-2xl font-bold ${outcome.crewWins ? "text-green-600" : "text-red-600"}`}>
            {outcome.crewWins ? t.imposterCrewWins : t.imposterImpostersWin}
          </Text>
        </View>
      ) : null}

      <View className="gap-2 rounded-xl border border-gray-100 p-4">
        <Text className="text-base text-gray-900">
          <Text className="text-gray-500">{t.imposterTheWord}: </Text>
          <Text className="font-bold">{round.word}</Text>
        </Text>
        {setup.mode === "similar-word" ? (
          <Text className="text-base text-gray-900">
            <Text className="text-gray-500">{t.imposterThePair}: </Text>
            <Text className="font-bold">{round.pair}</Text>
          </Text>
        ) : null}
        <Text className="text-base text-gray-900">
          <Text className="text-gray-500">{t.imposterWere}: </Text>
          <Text className="font-bold">{round.imposters.map((i) => names[i]).join(", ")}</Text>
        </Text>
      </View>

      {setup.scoreboard ? (
        <View className="rounded-xl border border-gray-100 p-4">
          <Text className="mb-2 text-sm font-medium text-gray-500">{t.imposterScores}</Text>
          {names
            .map((name, i) => ({ name, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score }) => (
              <View key={name} className="flex-row justify-between py-1">
                <Text className="text-base text-gray-900">{name}</Text>
                <Text className="text-base font-bold text-gray-900">{score}</Text>
              </View>
            ))}
        </View>
      ) : null}

      <PrimaryButton label={t.imposterNextRound} onPress={onNextRound} />
      <Pressable onPress={onEnd} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.imposterEnd}</Text>
      </Pressable>
    </View>
  );
}
