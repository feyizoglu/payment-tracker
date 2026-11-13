import { useEffect, useReducer, useState } from "react";
import { ActivityIndicator } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  NARRATOR_COLOR,
  gameReducer,
  initialGameState,
  playerColor,
  validateSetup,
  type WolfSetup,
} from "@ptracker/shared/wolf-game";
import { DealTurn } from "@/components/games/deal-turn";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { PassPhone } from "@/components/games/pass-phone";
import { WolfCard } from "@/components/games/wolf/wolf-card";
import { WolfChoose } from "@/components/games/wolf/wolf-choose";
import { WolfDay } from "@/components/games/wolf/wolf-day";
import { WolfEnd } from "@/components/games/wolf/wolf-end";
import { WolfNarrator } from "@/components/games/wolf/wolf-narrator";
import { WolfRemoval } from "@/components/games/wolf/wolf-removal";
import { WolfRoster } from "@/components/games/wolf/wolf-roster";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { WolfSetupWizard } from "@/components/games/wolf/wolf-setup";
import { WolfThisGame } from "@/components/games/wolf/wolf-this-game";
import { getStoredWolfSetup, setStoredWolfSetup } from "@/lib/wolf-game-storage";

export default function WolfScreen() {
  const { t } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<WolfSetup | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  // The This game screen opened from a Rules button covers the game until it is closed.
  const [rulesOpen, setRulesOpen] = useState(false);
  const pinReady = useEnterGameModeOnce();

  useEffect(() => {
    getStoredWolfSetup().then((saved) => {
      setDraft(saved);
      setPlayed(validateSetup(saved).length === 0);
    });
  }, []);

  if (!pinReady) return <GamesPinSetup title={t.wolfTitle} />;

  const { phase, setup, night } = state;
  const names = setup.players;
  const reveal = () => dispatch({ type: "reveal", at: Date.now() });
  const next = () => dispatch({ type: "next", rng: Math.random, at: Date.now() });
  const pick = (target: number) => dispatch({ type: "choose", target, at: Date.now() });
  const heal = () => dispatch({ type: "heal", at: Date.now() });
  const openRules = () => setRulesOpen(true);
  const newGame = () => {
    setDraft(setup);
    dispatch({ type: "newGame", at: Date.now() });
  };

  let body: React.ReactNode = null;
  // A screen that belongs to one player takes that player's colour.
  let color: string | undefined;
  // A held card must not sit in a ScrollView: the press is lost as soon as the finger drifts.
  let held = false;

  if (phase === "setup") {
    body = draft ? (
      <WolfSetupWizard
        value={draft}
        onChange={setDraft}
        step={step}
        onStep={setStep}
        quickStart={played}
        onStart={() => {
          void setStoredWolfSetup(draft);
          setPlayed(true);
          setStep(0);
          dispatch({ type: "start", setup: draft, at: Date.now() });
        }}
      />
    ) : (
      <ActivityIndicator />
    );
  } else if (phase === "rules") {
    body = (
      <WolfThisGame
        setup={setup}
        onDeal={() => dispatch({ type: "deal", rng: Math.random, at: Date.now() })}
        onBack={newGame}
      />
    );
  } else if (rulesOpen) {
    body = <WolfThisGame setup={setup} onClose={() => setRulesOpen(false)} />;
  } else if (phase === "deal" && state.turn === names.length) {
    color = NARRATOR_COLOR;
    body = (
      <PassPhone name={t.wolfTheNarrator} revealed={state.revealed} revealLabel={t.wolfShowAllRoles} onReveal={reveal}>
        <WolfRoster state={state} onStart={next} />
      </PassPhone>
    );
  } else if (phase === "deal") {
    color = playerColor(state.turn);
    held = true;
    body = (
      <>
        <WolfRulesButton onPress={openRules} ink />
        <DealTurn key={`deal-${state.turn}`} name={names[state.turn]} revealed={state.revealed} onReveal={reveal} onNext={next}>
          <WolfCard state={state} />
        </DealTurn>
      </>
    );
  } else if (phase === "night" && night && setup.night === "narrator") {
    body = <WolfNarrator state={state} onPick={pick} onHeal={heal} onNext={next} onRules={openRules} />;
  } else if (phase === "night" && night) {
    const seat = night.order[night.visit];
    color = playerColor(seat);
    if (night.stage === "card") {
      held = true;
      body = (
        <>
          <WolfRulesButton onPress={openRules} ink />
          <DealTurn
            key={`night-${night.number}-${night.lap}-${seat}`}
            name={names[seat]}
            revealed={state.revealed}
            onReveal={reveal}
            onNext={next}
            nextLabel={t.wolfContinue}>
            <WolfCard state={state} />
          </DealTurn>
        </>
      );
    } else {
      body = <WolfChoose state={state} onPick={pick} onHeal={heal} onNext={next} />;
    }
  } else if (phase === "morning" || (phase === "day" && state.dayStep === "result")) {
    body = (
      <WolfRemoval
        state={state}
        onShoot={(target) => dispatch({ type: "shoot", target, at: Date.now() })}
        onContinue={() => dispatch({ type: "continue", at: Date.now() })}
        onRules={phase === "morning" ? openRules : undefined}
      />
    );
  } else if (phase === "day") {
    body = (
      <WolfDay
        state={state}
        onVote={() => dispatch({ type: "vote", at: Date.now() })}
        onTalk={() => dispatch({ type: "talk", at: Date.now() })}
        onVoteOut={(target) => dispatch({ type: "voteOut", target, at: Date.now() })}
        onRules={openRules}
      />
    );
  } else {
    body = <WolfEnd state={state} onPlayAgain={() => dispatch({ type: "playAgain", at: Date.now() })} onNewGame={newGame} />;
  }

  return (
    <GameScreen title={t.wolfTitle} tone="game" color={color} scroll={!held}>
      {body}
    </GameScreen>
  );
}
