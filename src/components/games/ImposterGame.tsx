"use client";

import { useEffect, useReducer, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  SETUP_STORAGE_KEY,
  gameReducer,
  initialGameState,
  parseSavedSetup,
  type ImposterSetup,
} from "@/lib/imposter";
import ImposterSetupForm from "./ImposterSetupForm";
import PassPhone from "./PassPhone";
import ImposterDiscuss from "./ImposterDiscuss";
import ImposterResult from "./ImposterResult";

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

export default function ImposterGame() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup>(DEFAULT_SETUP);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(loadSetup());
  }, []);

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;

  if (phase === "setup") {
    return (
      <ImposterSetupForm
        value={draft}
        onChange={setDraft}
        onStart={() => {
          saveSetup(draft);
          dispatch({ type: "start", setup: draft, lang, rng: Math.random, at: Date.now() });
        }}
      />
    );
  }

  if (!round) return null;

  if (phase === "deal") {
    const card = round.cards[turn];
    return (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterShow} onReveal={() => dispatch({ type: "reveal", at: Date.now() })}>
        {card.kind === "word" ? (
          <div className="space-y-2 py-6">
            <p className="text-sm text-gray-500">{t.imposterYourWord}</p>
            <p className="text-4xl font-bold text-gray-900">{card.text}</p>
          </div>
        ) : (
          <div className="space-y-2 py-6">
            <p className="text-3xl font-bold text-red-600">{t.imposterYouAre}</p>
            <p className="text-gray-500">
              {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: "next", at: Date.now() })}
          className="rounded-lg bg-gray-900 px-10 py-3 font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
        >
          {t.imposterHideNext}
        </button>
      </PassPhone>
    );
  }

  if (phase === "discuss") {
    return (
      <ImposterDiscuss
        starter={names[round.starter]}
        timerMinutes={setup.timerMinutes}
        voting={setup.voting}
        onFinish={() => dispatch({ type: "finishDiscussion", at: Date.now() })}
      />
    );
  }

  if (phase === "vote") {
    return (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterOpenBallot} onReveal={() => dispatch({ type: "reveal", at: Date.now() })}>
        <p className="text-xl font-bold text-gray-900">{t.imposterWhoIs}</p>
        <div className="grid grid-cols-2 gap-2">
          {names.map((name, i) =>
            i === turn ? null : (
              <button
                key={name}
                type="button"
                onClick={() => dispatch({ type: "vote", target: i, at: Date.now() })}
                className="rounded-lg border border-gray-200 bg-surface py-3 text-gray-900 hover:bg-gray-100"
              >
                {name}
              </button>
            )
          )}
        </div>
      </PassPhone>
    );
  }

  return (
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
