import { useCallback, useEffect, useReducer, useState, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  POTATO_BANG_COLOR,
  initialPotatoState,
  playerColor,
  potatoPool,
  potatoReducer,
  taskText,
  validateSetup,
  winner,
  type PotatoSetup,
} from "@ptracker/shared/hot-potato";
import { HOT_POTATO_PROMPTS } from "@ptracker/shared/hot-potato-prompts";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { PotatoBang } from "@/components/games/potato/potato-bang";
import { PotatoEnd } from "@/components/games/potato/potato-end";
import { PotatoPlay } from "@/components/games/potato/potato-play";
import { PotatoReady } from "@/components/games/potato/potato-ready";
import { PotatoSetupWizard } from "@/components/games/potato/potato-setup";
import { getStoredPotatoSetup, setStoredPotatoSetup } from "@/lib/hot-potato-storage";

export default function PotatoScreen() {
  const { t, lang } = useLang();
  // The name rules a saved setup is checked with follow the language the screen opened in.
  const [nameLocale] = useState(() => localeFor(lang));
  const [state, dispatch] = useReducer(potatoReducer, undefined, () => initialPotatoState());
  const [draft, setDraft] = useState<PotatoSetup | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();
  const tick = useCallback(() => dispatch({ type: "tick", at: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", at: Date.now() }), []);
  const resume = useCallback(() => dispatch({ type: "resume", at: Date.now() }), []);

  useEffect(() => {
    getStoredPotatoSetup().then((saved) => {
      setDraft(saved);
      setPlayed(validateSetup(saved, nameLocale).length === 0);
    });
  }, [nameLocale]);

  if (!pinReady) return <GamesPinSetup title={t.potatoTitle} />;

  const { phase, setup, pool, task, holder } = state;
  const names = setup.players;
  let body: ReactNode = null;
  // The ready and play screens belong to the holder and take their colour.
  let color: string | undefined;

  if (phase === "setup") {
    body = draft ? (
      <PotatoSetupWizard
        value={draft}
        onChange={setDraft}
        step={step}
        onStep={setStep}
        quickStart={played}
        onStart={() => {
          void setStoredPotatoSetup(draft);
          setPlayed(true);
          setStep(0);
          dispatch({ type: "start", setup: draft, pool: potatoPool(lang, HOT_POTATO_PROMPTS[lang]), rng: Math.random, at: Date.now() });
        }}
      />
    ) : (
      <ActivityIndicator />
    );
  } else if (phase === "ready") {
    color = playerColor(holder);
    body = <PotatoReady name={names[holder]} onStart={() => dispatch({ type: "light", rng: Math.random, at: Date.now() })} />;
  } else if (phase === "playing" && task && pool) {
    color = playerColor(holder);
    body = (
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
    );
  } else if (phase === "bang") {
    color = POTATO_BANG_COLOR;
    body = (
      <PotatoBang
        key={state.bangAt}
        name={names[holder]}
        livesLeft={state.lives[holder]}
        bangAt={state.bangAt}
        onNext={() => dispatch({ type: "next", at: Date.now() })}
      />
    );
  } else if (phase === "end") {
    const won = winner(state);
    body =
      won === null ? null : (
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
      );
  }

  return (
    <GameScreen title={t.potatoTitle} tone="game" color={color} scroll={phase === "setup" || phase === "end"}>
      {body}
    </GameScreen>
  );
}
