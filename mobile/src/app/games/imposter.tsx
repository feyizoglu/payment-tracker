import { useEffect, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_LABEL_KEYS,
  GAME_THEME,
  gameReducer,
  initialGameState,
  playerColor,
  validateSetup,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { DealTurn } from "@/components/games/deal-turn";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import { ImposterResult } from "@/components/games/imposter-result";
import { ImposterSetupWizard } from "@/components/games/imposter-setup";
import { PassPhone } from "@/components/games/pass-phone";
import { getStoredSetup, setStoredSetup } from "@/lib/imposter-storage";

export default function ImposterScreen() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();

  useEffect(() => {
    getStoredSetup().then((saved) => {
      setDraft(saved);
      setPlayed(validateSetup(saved).length === 0);
    });
  }, []);

  if (!pinReady) return <GamesPinSetup title={t.imposterTitle} />;

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;
  // Deal and vote belong to one player at a time: the screen takes that player's colour.
  const ownTurn = round !== null && (phase === "deal" || phase === "vote");

  let body: React.ReactNode = null;

  if (phase === "setup") {
    body = draft ? (
      <ImposterSetupWizard
        value={draft}
        onChange={setDraft}
        step={step}
        onStep={setStep}
        quickStart={played}
        onStart={() => {
          void setStoredSetup(draft);
          setPlayed(true);
          setStep(0);
          dispatch({ type: "start", setup: draft, lang, rng: Math.random, at: Date.now() });
        }}
      />
    ) : (
      <ActivityIndicator />
    );
  } else if (round && phase === "deal") {
    const card = round.cards[turn];
    // The card text is the same colour for every role: only the words differ.
    const label = (
      <Text className="text-sm" style={{ color: GAME_THEME.muted }}>
        {t.imposterYourWord}
      </Text>
    );
    body = (
      <DealTurn
        key={turn}
        name={names[turn]}
        revealed={revealed}
        onReveal={() => dispatch({ type: "reveal", at: Date.now() })}
        onNext={() => dispatch({ type: "next", at: Date.now() })}>
        {card.kind === "word" ? (
          <>
            {label}
            <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
              {card.text}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-center text-3xl font-bold" style={{ color: GAME_THEME.text }}>
              {t.imposterYouAre}
            </Text>
            {card.word ? (
              <>
                {label}
                <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
                  {card.word}
                </Text>
              </>
            ) : (
              <Text style={{ color: GAME_THEME.muted }}>
                {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
              </Text>
            )}
          </>
        )}
      </DealTurn>
    );
  } else if (round && phase === "discuss") {
    body = (
      <ImposterDiscuss
        starter={names[round.starter]}
        starterColor={playerColor(round.starter)}
        timerMinutes={setup.timerMinutes}
        voting={setup.voting}
        onFinish={() => dispatch({ type: "finishDiscussion", at: Date.now() })}
      />
    );
  } else if (round && phase === "vote") {
    body = (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterOpenBallot} onReveal={() => dispatch({ type: "reveal", at: Date.now() })}>
        <Text className="text-center text-xl font-bold" style={{ color: GAME_THEME.ink }}>
          {t.imposterWhoIs}
        </Text>
        <View className="gap-2">
          {names.map((name, i) =>
            i === turn ? null : (
              <Pressable
                key={name}
                onPress={() => dispatch({ type: "vote", target: i, at: Date.now() })}
                className="rounded-xl border-2 py-3"
                style={{ backgroundColor: playerColor(i), borderColor: GAME_THEME.bg }}>
                <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.ink }}>
                  {name}
                </Text>
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
          dispatch({ type: "end", at: Date.now() });
        }}
      />
    );
  }

  return (
    <GameScreen
      title={t.imposterTitle}
      tone="game"
      color={ownTurn ? playerColor(turn) : undefined}
      scroll={phase !== "deal"}>
      {body}
    </GameScreen>
  );
}
