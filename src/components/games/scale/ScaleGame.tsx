"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { localeFor, useLang } from "@/lib/i18n";
import { SCALE_PAIRS } from "@/lib/scale-pairs";
import {
  SCALE_SETUP_STORAGE_KEY,
  defaultScaleSetup,
  defaultTeamNames,
  initialScaleState,
  parseSavedScaleSetup,
  scaleClueGiver,
  scaleReducer,
  scaleSetupInLang,
  scaleTeam,
  scaleTurn,
  teamColor,
  validateScaleSetup,
  type ScaleSetup,
} from "@/lib/scale-game";
import GameFrame from "../GameFrame";
import ScaleEnd from "./ScaleEnd";
import ScaleGuess from "./ScaleGuess";
import ScaleHandoff from "./ScaleHandoff";
import ScaleReveal from "./ScaleReveal";
import ScaleSecret from "./ScaleSecret";
import ScaleSetupWizard from "./ScaleSetupWizard";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or full storage: the game still runs, it just forgets.
  }
}

// Returns only other components, never a host element: its test renders it without a DOM.
export default function ScaleGame() {
  const { t, lang } = useLang();
  const teamNames = useMemo(() => defaultTeamNames(t.wordTeamDefault), [t.wordTeamDefault]);
  // A saved setup is read, and its names checked, in the language the page opened in.
  const [openLang] = useState(lang);
  const [openTeamNames] = useState(teamNames);
  const [state, dispatch] = useReducer(scaleReducer, undefined, () => initialScaleState(defaultScaleSetup(teamNames)));
  const [draft, setDraft] = useState<ScaleSetup>(() => defaultScaleSetup(teamNames));
  // The page opens in English and may be switched: until a setup is saved, the draft's default
  // team names follow the language. null: not read yet.
  const [saved, setSaved] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const move = useCallback((needle: number) => dispatch({ type: "move", needle, at: Date.now() }), []);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const raw = read(SCALE_SETUP_STORAGE_KEY);
    const stored = parseSavedScaleSetup(raw, openTeamNames);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(stored);
    setSaved(raw !== null);
    setPlayed(validateScaleSetup(stored, localeFor(openLang)).length === 0);
  }, [openTeamNames, openLang]);

  useEffect(() => {
    if (saved !== false) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((d) => scaleSetupInLang(d, teamNames));
  }, [saved, teamNames]);

  const { phase, setup, pair } = state;

  // Only a game the reducer started is remembered: a refused Start leaves the setup and the
  // wizard as they were. Play again saves the same setup again.
  useEffect(() => {
    if (phase !== "handoff" || state.turnsPlayed !== 0) return;
    write(SCALE_SETUP_STORAGE_KEY, JSON.stringify(setup));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(true);
    setPlayed(true);
    setStep(0);
  }, [phase, state.turnsPlayed, setup]);

  const team = scaleTeam(state);
  const teamName = setup.teams[team].name;

  if (phase === "setup") {
    return (
      <GameFrame>
        <ScaleSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => dispatch({ type: "start", setup: draft, lang, pairs: SCALE_PAIRS[lang], at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "handoff") {
    return (
      <GameFrame color={teamColor(team)}>
        <ScaleHandoff
          team={teamName}
          giver={scaleClueGiver(state)}
          turn={scaleTurn(state)}
          turns={setup.turns}
          teams={setup.teams}
          scores={state.scores}
          onShow={() => dispatch({ type: "show", rng: Math.random, at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "secret" || phase === "guess" || phase === "reveal") {
    if (!pair) return null;
    return (
      <GameFrame>
        {phase === "secret" && (
          <ScaleSecret pair={pair} target={state.target} onHide={() => dispatch({ type: "hide", at: Date.now() })} />
        )}
        {phase === "guess" && (
          <ScaleGuess
            pair={pair}
            team={teamName}
            color={teamColor(team)}
            needle={state.needle}
            confirming={state.confirming}
            onMove={move}
            onLock={() => dispatch({ type: "lock", at: Date.now() })}
          />
        )}
        {phase === "reveal" && (
          <ScaleReveal
            key={state.turnsPlayed}
            pair={pair}
            target={state.target}
            needle={state.needle}
            team={teamName}
            color={teamColor(team)}
            teams={setup.teams}
            scores={state.scores}
            revealedAt={state.revealedAt}
            onNext={() => dispatch({ type: "next", at: Date.now() })}
          />
        )}
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <ScaleEnd
        teams={setup.teams}
        scores={state.scores}
        onPlayAgain={() => dispatch({ type: "playAgain", at: Date.now() })}
        onNewGame={() => {
          setDraft(setup);
          dispatch({ type: "newGame", at: Date.now() });
        }}
      />
    </GameFrame>
  );
}
