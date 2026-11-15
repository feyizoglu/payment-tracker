import { useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { CLUE_ERROR_KEYS, CLUE_MAX_LENGTH, GAME_THEME, validateClue } from "@ptracker/shared/clue-game";
import { GameButton } from "@/components/games/game-button";
import { PassPhone } from "@/components/games/pass-phone";

// One clue giver's turn, on their colour. Mount it with a `key` per giver: the field must
// start empty, never with the last giver's clue in it.
export function ClueWrite({
  giver,
  word,
  revealed,
  onReveal,
  onSubmit,
}: {
  giver: string;
  word: string;
  /** The giver tapped Show the word. */
  revealed: boolean;
  onReveal: () => void;
  onSubmit: (clue: string) => void;
}) {
  const { t } = useLang();
  const [clue, setClue] = useState("");
  const error = validateClue(clue);
  // An empty field only keeps Done disabled; the other errors are said.
  const said = error === "empty" ? null : error;
  const ink = { color: GAME_THEME.ink };
  const submit = () => {
    if (error === null) onSubmit(clue);
  };

  return (
    <PassPhone name={giver} revealed={revealed} revealLabel={t.clueShowWord} onReveal={onReveal}>
      <View className="gap-1">
        <Text className="text-center text-sm font-semibold" style={[ink, { opacity: 0.8 }]}>
          {t.clueTheWord}
        </Text>
        <Text className="text-center text-4xl font-black" style={ink}>
          {word}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold" style={ink}>
          {t.clueYourClue}
        </Text>
        <TextInput
          value={clue}
          onChangeText={setClue}
          onSubmitEditing={submit}
          accessibilityLabel={t.clueYourClue}
          // Android keyboards learn typed words and offer them to the next giver; this
          // keyboard neither suggests nor learns.
          keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          returnKeyType="done"
          maxLength={CLUE_MAX_LENGTH}
          className="rounded-lg px-3 py-3 text-xl font-semibold"
          style={{ color: GAME_THEME.ink, backgroundColor: "rgba(255, 255, 255, 0.7)" }}
        />
        <Text className="text-xs" style={[ink, { opacity: 0.8 }]}>
          {t.clueClueHint}
        </Text>
        {said ? (
          <Text className="text-sm font-semibold" style={ink} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {t[CLUE_ERROR_KEYS[said]]}
          </Text>
        ) : null}
      </View>
      <GameButton label={t.clueDone} onPress={submit} disabled={error !== null} />
    </PassPhone>
  );
}
