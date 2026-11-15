import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CLUE_ANSWER_KEYS,
  CLUE_OUTCOMES,
  CLUE_OUTCOME_LOOK,
  GAME_THEME,
  fillTemplate,
  type ClueOutcome,
} from "@ptracker/shared/clue-game";
import { GameButton } from "@/components/games/game-button";

// The guesser's screen, on their colour: the surviving clues only, never the word or the
// writers. With no clue left the word can only be passed.
export function ClueGuess({
  guesser,
  clues,
  onAnswer,
}: {
  guesser: string;
  clues: readonly string[];
  onAnswer: (outcome: ClueOutcome) => void;
}) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };
  const none = clues.length === 0;
  const answers: readonly ClueOutcome[] = none ? ["passed"] : CLUE_OUTCOMES;

  return (
    <View className="gap-6 py-4">
      <Text className="text-center text-xl font-bold" style={ink}>
        {fillTemplate(t.clueGuessHint, { name: guesser })}
      </Text>
      {none ? (
        <Text className="text-center text-lg font-semibold" style={ink}>
          {t.clueNoClues}
        </Text>
      ) : (
        <View className="gap-3">
          {clues.map((clue, i) => (
            <View key={i} className="rounded-2xl px-4 py-4" style={{ backgroundColor: "rgba(255, 255, 255, 0.8)" }}>
              <Text className="text-center text-3xl font-black" style={ink}>
                {clue}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View className="gap-3">
        {answers.map((outcome) => (
          <GameButton
            key={outcome}
            label={`${CLUE_OUTCOME_LOOK[outcome].mark} ${t[CLUE_ANSWER_KEYS[outcome]]}`}
            onPress={() => onAnswer(outcome)}
          />
        ))}
      </View>
    </View>
  );
}
