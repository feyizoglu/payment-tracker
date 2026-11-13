"use client";

import { useEffect, useReducer, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  DEFAULT_SETUP,
  NARRATOR_COLOR,
  SETUP_STORAGE_KEY,
  gameReducer,
  initialGameState,
  parseSavedSetup,
  playerColor,
  validateSetup,
  type WolfSetup,
} from "@/lib/wolf-game";
import DealTurn from "../DealTurn";
import GameFrame from "../GameFrame";
import PassPhone from "../PassPhone";
import WolfCard from "./WolfCard";
import WolfChoose from "./WolfChoose";
import WolfDay from "./WolfDay";
import WolfEnd from "./WolfEnd";
import WolfNarrator from "./WolfNarrator";
import WolfRemoval from "./WolfRemoval";
import WolfRoster from "./WolfRoster";
import WolfRulesButton from "./WolfRulesButton";
import WolfSetupWizard from "./WolfSetupWizard";
import WolfThisGame from "./WolfThisGame";

function loadSetup(): WolfSetup {
  try {
    return parseSavedSetup(localStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(setup: WolfSetup) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Private mode or full storage: the game still runs, the names just are not remembered.
  }
}

// Returns only other components, never a host element: its test renders it without a DOM.
export default function WolfGame() {
  const { t } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<WolfSetup>(DEFAULT_SETUP);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  // The This game screen opened from a Rules button covers the game until it is closed.
  const [rulesOpen, setRulesOpen] = useState(false);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const saved = loadSetup();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setPlayed(validateSetup(saved).length === 0);
  }, []);

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

  if (phase === "setup") {
    return (
      <GameFrame>
        <WolfSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            saveSetup(draft);
            setPlayed(true);
            setStep(0);
            dispatch({ type: "start", setup: draft, at: Date.now() });
          }}
        />
      </GameFrame>
    );
  }

  if (phase === "rules") {
    return (
      <GameFrame>
        <WolfThisGame
          setup={setup}
          onDeal={() => dispatch({ type: "deal", rng: Math.random, at: Date.now() })}
          onBack={newGame}
        />
      </GameFrame>
    );
  }

  if (rulesOpen) {
    return (
      <GameFrame>
        <WolfThisGame setup={setup} onClose={() => setRulesOpen(false)} />
      </GameFrame>
    );
  }

  if (phase === "deal" && state.turn === names.length) {
    return (
      <GameFrame color={NARRATOR_COLOR}>
        <WolfRulesButton onClick={openRules} />
        <PassPhone name={t.wolfTheNarrator} revealed={state.revealed} revealLabel={t.wolfShowAllRoles} onReveal={reveal}>
          <WolfRoster state={state} onStart={next} />
        </PassPhone>
      </GameFrame>
    );
  }

  if (phase === "deal") {
    return (
      <GameFrame color={playerColor(state.turn)}>
        <WolfRulesButton onClick={openRules} />
        <DealTurn key={`deal-${state.turn}`} name={names[state.turn]} revealed={state.revealed} onReveal={reveal} onNext={next}>
          <WolfCard state={state} />
        </DealTurn>
      </GameFrame>
    );
  }

  if (phase === "night" && night && setup.night === "narrator") {
    return (
      <GameFrame>
        <WolfNarrator state={state} onPick={pick} onHeal={heal} onNext={next} onRules={openRules} />
      </GameFrame>
    );
  }

  if (phase === "night" && night) {
    const seat = night.order[night.visit];
    // The task card and the result card are both held; between them sits the open choice.
    if (night.stage !== "choose") {
      return (
        <GameFrame color={playerColor(seat)}>
          <WolfRulesButton onClick={openRules} />
          <DealTurn
            key={`night-${night.number}-${night.lap}-${seat}-${night.stage}`}
            name={names[seat]}
            title={night.stage === "result" ? names[seat] : undefined}
            revealed={state.revealed}
            onReveal={reveal}
            onNext={next}
            nextLabel={t.wolfContinue}
          >
            <WolfCard state={state} />
          </DealTurn>
        </GameFrame>
      );
    }
    return (
      <GameFrame color={playerColor(seat)}>
        <WolfChoose state={state} onPick={pick} onHeal={heal} onNext={next} />
      </GameFrame>
    );
  }

  if (phase === "morning" || (phase === "day" && state.dayStep === "result")) {
    return (
      <GameFrame>
        <WolfRemoval
          state={state}
          onShoot={(target) => dispatch({ type: "shoot", target, at: Date.now() })}
          onContinue={() => dispatch({ type: "continue", at: Date.now() })}
          onRules={phase === "morning" ? openRules : undefined}
        />
      </GameFrame>
    );
  }

  if (phase === "day") {
    return (
      <GameFrame>
        <WolfDay
          state={state}
          onVote={() => dispatch({ type: "vote", at: Date.now() })}
          onTalk={() => dispatch({ type: "talk", at: Date.now() })}
          onVoteOut={(target) => dispatch({ type: "voteOut", target, at: Date.now() })}
          onRules={openRules}
        />
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <WolfEnd state={state} onPlayAgain={() => dispatch({ type: "playAgain", at: Date.now() })} onNewGame={newGame} />
    </GameFrame>
  );
}
