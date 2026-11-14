"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { localeFor, useLang } from "@/lib/i18n";
import { HOT_POTATO_PROMPTS } from "@/lib/hot-potato-prompts";
import {
  DEFAULT_SETUP,
  POTATO_BANG_COLOR,
  SETUP_STORAGE_KEY,
  initialPotatoState,
  parseSavedSetup,
  playerColor,
  potatoPool,
  potatoReducer,
  taskText,
  validateSetup,
  winner,
  type PotatoSetup,
} from "@/lib/hot-potato";
import GameFrame from "../GameFrame";
import PotatoBang from "./PotatoBang";
import PotatoEnd from "./PotatoEnd";
import PotatoPlay from "./PotatoPlay";
import PotatoReady from "./PotatoReady";
import PotatoSetupWizard from "./PotatoSetupWizard";

function loadSetup(): PotatoSetup {
  try {
    return parseSavedSetup(localStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(setup: PotatoSetup) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Private mode or full storage: the game still runs, the names just are not remembered.
  }
}

// Returns only other components, never a host element: its test renders it without a DOM.
export default function PotatoGame() {
  const { lang } = useLang();
  // The name rules a saved setup is checked with follow the language the page opened in.
  const [nameLocale] = useState(() => localeFor(lang));
  const [state, dispatch] = useReducer(potatoReducer, undefined, () => initialPotatoState());
  const [draft, setDraft] = useState<PotatoSetup>(DEFAULT_SETUP);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const tick = useCallback(() => dispatch({ type: "tick", at: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", at: Date.now() }), []);
  const resume = useCallback(() => dispatch({ type: "resume", at: Date.now() }), []);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const saved = loadSetup();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setPlayed(validateSetup(saved, nameLocale).length === 0);
  }, [nameLocale]);

  const { phase, setup, pool, task, holder } = state;
  const names = setup.players;

  if (phase === "setup") {
    return (
      <GameFrame>
        <PotatoSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            saveSetup(draft);
            setPlayed(true);
            setStep(0);
            dispatch({
              type: "start",
              setup: draft,
              pool: potatoPool(lang, HOT_POTATO_PROMPTS[lang]),
              rng: Math.random,
              at: Date.now(),
            });
          }}
        />
      </GameFrame>
    );
  }

  if (phase === "ready") {
    return (
      <GameFrame color={playerColor(holder)}>
        <PotatoReady name={names[holder]} onStart={() => dispatch({ type: "light", rng: Math.random, at: Date.now() })} />
      </GameFrame>
    );
  }

  if (phase === "playing") {
    if (!task || !pool) return null;
    return (
      <GameFrame color={playerColor(holder)}>
        <PotatoPlay
          holder={names[holder]}
          task={taskText(task, pool.lang)}
          fuseMs={state.fuseMs}
          burntMs={state.burntMs}
          litAt={state.litAt}
          onPass={() => dispatch({ type: "pass", at: Date.now() })}
          onTick={tick}
          onPause={pause}
          onResume={resume}
        />
      </GameFrame>
    );
  }

  if (phase === "bang") {
    return (
      <GameFrame color={POTATO_BANG_COLOR}>
        <PotatoBang
          key={state.bangAt}
          name={names[holder]}
          livesLeft={state.lives[holder]}
          bangAt={state.bangAt}
          onNext={() => dispatch({ type: "next", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  const won = winner(state);
  if (won === null) return null;
  return (
    <GameFrame>
      <PotatoEnd
        players={names}
        winner={won}
        outOrder={state.outOrder}
        onPlayAgain={() => dispatch({ type: "playAgain", rng: Math.random, at: Date.now() })}
        onNewGame={() => {
          setDraft(setup);
          dispatch({ type: "newGame", at: Date.now() });
        }}
      />
    </GameFrame>
  );
}
