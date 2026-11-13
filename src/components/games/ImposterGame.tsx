"use client";

import { useEffect, useReducer, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  GAME_THEME,
  SETUP_STORAGE_KEY,
  gameReducer,
  initialGameState,
  parseSavedSetup,
  playerColor,
  validateSetup,
  type ImposterSetup,
} from "@/lib/imposter";
import DealTurn from "./DealTurn";
import GameFrame from "./GameFrame";
import ImposterDiscuss from "./ImposterDiscuss";
import ImposterResult from "./ImposterResult";
import ImposterSetupWizard from "./ImposterSetupWizard";
import PassPhone from "./PassPhone";

function loadSetup(): ImposterSetup {
  try {
    return parseSavedSetup(localStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(setup: ImposterSetup) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Private mode or full storage: the game still runs, the names just are not remembered.
  }
}

// Returns only other components, never a host element: its test renders it without a DOM.
export default function ImposterGame() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup>(DEFAULT_SETUP);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const saved = loadSetup();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setPlayed(validateSetup(saved).length === 0);
  }, []);

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;

  if (phase === "setup") {
    return (
      <GameFrame>
        <ImposterSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            saveSetup(draft);
            setPlayed(true);
            setStep(0);
            dispatch({ type: "start", setup: draft, lang, rng: Math.random, at: Date.now() });
          }}
        />
      </GameFrame>
    );
  }

  if (!round) return null;

  if (phase === "deal") {
    const card = round.cards[turn];
    // The card text is the same colour for every role: only the words differ.
    const label = <p className="text-sm" style={{ color: GAME_THEME.muted }}>{t.imposterYourWord}</p>;
    return (
      <GameFrame color={playerColor(turn)}>
        <DealTurn
          key={turn}
          name={names[turn]}
          revealed={revealed}
          onReveal={() => dispatch({ type: "reveal", at: Date.now() })}
          onNext={() => dispatch({ type: "next", at: Date.now() })}
        >
          {card.kind === "word" ? (
            <>
              {label}
              <p className="text-4xl font-bold">{card.text}</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold">{t.imposterYouAre}</p>
              {card.word ? (
                <>
                  {label}
                  <p className="text-4xl font-bold">{card.word}</p>
                </>
              ) : (
                <p style={{ color: GAME_THEME.muted }}>
                  {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
                </p>
              )}
            </>
          )}
        </DealTurn>
      </GameFrame>
    );
  }

  if (phase === "discuss") {
    return (
      <GameFrame>
        <ImposterDiscuss
          starter={names[round.starter]}
          starterColor={playerColor(round.starter)}
          timerMinutes={setup.timerMinutes}
          voting={setup.voting}
          onFinish={() => dispatch({ type: "finishDiscussion", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "vote") {
    return (
      <GameFrame color={playerColor(turn)}>
        <PassPhone
          name={names[turn]}
          revealed={revealed}
          revealLabel={t.imposterOpenBallot}
          onReveal={() => dispatch({ type: "reveal", at: Date.now() })}
        >
          <p className="text-xl font-bold">{t.imposterWhoIs}</p>
          <div className="grid grid-cols-2 gap-2">
            {names.map((name, i) =>
              i === turn ? null : (
                <button
                  key={name}
                  type="button"
                  onClick={() => dispatch({ type: "vote", target: i, at: Date.now() })}
                  className="rounded-xl border-2 py-3 font-semibold"
                  style={{ backgroundColor: playerColor(i), color: GAME_THEME.ink, borderColor: GAME_THEME.bg }}
                >
                  {name}
                </button>
              )
            )}
          </div>
        </PassPhone>
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <ImposterResult
        state={state}
        onNextRound={() => dispatch({ type: "nextRound", lang, rng: Math.random, at: Date.now() })}
        onEnd={() => {
          setDraft(state.setup);
          dispatch({ type: "end", at: Date.now() });
        }}
      />
    </GameFrame>
  );
}
