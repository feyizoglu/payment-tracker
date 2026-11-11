import { useEffect, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_LABEL_KEYS,
  gameReducer,
  initialGameState,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { GameScreen } from "@/components/games/game-screen";
import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import { ImposterResult } from "@/components/games/imposter-result";
import { ImposterSetupForm } from "@/components/games/imposter-setup";
import { PassPhone } from "@/components/games/pass-phone";
import { PrimaryButton } from "@/components/ui/primary-button";
import { getStoredSetup, setStoredSetup } from "@/lib/imposter-storage";

export default function ImposterScreen() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup | null>(null);

  useEffect(() => {
    getStoredSetup().then(setDraft);
  }, []);

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;

  let body: React.ReactNode = null;

  if (phase === "setup") {
    body = draft ? (
      <ImposterSetupForm
        value={draft}
        onChange={setDraft}
        onStart={() => {
          void setStoredSetup(draft);
          dispatch({ type: "start", setup: draft, lang, rng: Math.random, at: Date.now() });
        }}
      />
    ) : (
      <ActivityIndicator />
    );
  } else if (round && phase === "deal") {
    const card = round.cards[turn];
    body = (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterShow} onReveal={() => dispatch({ type: "reveal", at: Date.now() })}>
        {card.kind === "word" ? (
          <View className="items-center gap-2 py-8">
            <Text className="text-sm text-gray-500">{t.imposterYourWord}</Text>
            <Text className="text-center text-4xl font-bold text-gray-900">{card.text}</Text>
          </View>
        ) : (
          <View className="items-center gap-2 py-8">
            <Text className="text-center text-3xl font-bold text-red-600">{t.imposterYouAre}</Text>
            <Text className="text-gray-500">
              {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
            </Text>
          </View>
        )}
        <PrimaryButton label={t.imposterHideNext} onPress={() => dispatch({ type: "next", at: Date.now() })} />
      </PassPhone>
    );
  } else if (round && phase === "discuss") {
    body = (
      <ImposterDiscuss
        starter={names[round.starter]}
        timerMinutes={setup.timerMinutes}
        voting={setup.voting}
        onFinish={() => dispatch({ type: "finishDiscussion", at: Date.now() })}
      />
    );
  } else if (round && phase === "vote") {
    body = (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterOpenBallot} onReveal={() => dispatch({ type: "reveal", at: Date.now() })}>
        <Text className="text-center text-xl font-bold text-gray-900">{t.imposterWhoIs}</Text>
        <View className="gap-2">
          {names.map((name, i) =>
            i === turn ? null : (
              <Pressable
                key={name}
                onPress={() => dispatch({ type: "vote", target: i, at: Date.now() })}
                className="rounded-lg border border-gray-200 py-3">
                <Text className="text-center text-base text-gray-900">{name}</Text>
              </Pressable>
            )
          )}
        </View>
      </PassPhone>
    );
  } else if (phase === "result") {
    body = (
      <ImposterResult
        state={state}
        onNextRound={() => dispatch({ type: "nextRound", lang, rng: Math.random, at: Date.now() })}
        onEnd={() => {
          setDraft(state.setup);
          dispatch({ type: "end" });
        }}
      />
    );
  }

  return <GameScreen title={t.imposterTitle}>{body}</GameScreen>;
}
