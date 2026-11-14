"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { localeFor, useLang } from "@/lib/i18n";
import { WHO_CHARACTERS, WHO_PEOPLE } from "@/lib/who-cards";
import { WHO_THINGS } from "@/lib/who-things";
import {
  WHO_SETUP_STORAGE_KEY,
  defaultTeamNames,
  defaultWhoSetup,
  initialWhoState,
  parseSavedWhoSeen,
  parseSavedWhoSetup,
  sideColor,
  validateWhoSetup,
  whoGuesser,
  whoPool,
  whoReducer,
  whoRound,
  whoScores,
  whoSeenKey,
  whoSide,
  type WhoSetup,
  type WhoSources,
} from "@/lib/who-game";
import GameFrame from "../GameFrame";
import WhoEnd from "./WhoEnd";
import WhoHandoff from "./WhoHandoff";
import WhoSetupWizard from "./WhoSetupWizard";
import WhoSummary from "./WhoSummary";
import WhoTurn from "./WhoTurn";

const SOURCES: WhoSources = { people: WHO_PEOPLE, characters: WHO_CHARACTERS, things: WHO_THINGS };

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
export default function WhoGame() {
  const { t, lang } = useLang();
  // The default team names and region, and the name rules a saved setup is checked with,
  // follow the language the page opened in.
  const [teamNames] = useState(() => defaultTeamNames(t.wordTeamDefault));
  const [openLang] = useState(lang);
  const [state, dispatch] = useReducer(whoReducer, undefined, () => initialWhoState(defaultWhoSetup(lang, teamNames)));
  const [draft, setDraft] = useState<WhoSetup>(() => defaultWhoSetup(lang, teamNames));
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const tick = useCallback(() => dispatch({ type: "tick", at: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", at: Date.now() }), []);
  const resume = useCallback(() => dispatch({ type: "resume", at: Date.now() }), []);
  const { kinds, region, level } = draft;
  const poolSize = useMemo(() => whoPool({ kinds, region, level }, SOURCES, lang).length, [kinds, region, level, lang]);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const saved = parseSavedWhoSetup(read(WHO_SETUP_STORAGE_KEY), openLang, teamNames);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setPlayed(validateWhoSetup(saved, localeFor(openLang), whoPool(saved, SOURCES, openLang).length).length === 0);
  }, [teamNames, openLang]);

  const { phase, setup, pool, seen } = state;
  useEffect(() => {
    if (pool.length > 0 && (phase === "summary" || phase === "end")) write(whoSeenKey(state.lang), JSON.stringify(seen));
  }, [phase, pool, seen, state.lang]);

  const names = setup.mode === "solo" ? setup.players : setup.teams.map((team) => team.name);
  const colors = names.map((_, i) => sideColor(setup.mode, i));
  const side = whoSide(state);

  if (phase === "setup") {
    return (
      <GameFrame>
        <WhoSetupWizard
          value={draft}
          onChange={setDraft}
          poolSize={poolSize}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            write(WHO_SETUP_STORAGE_KEY, JSON.stringify(draft));
            setPlayed(true);
            setStep(0);
            dispatch({
              type: "start",
              setup: draft,
              lang,
              sources: SOURCES,
              seen: parseSavedWhoSeen(read(whoSeenKey(lang))),
              rng: Math.random,
              at: Date.now(),
            });
          }}
        />
      </GameFrame>
    );
  }

  if (phase === "handoff") {
    return (
      <GameFrame color={colors[side]}>
        <WhoHandoff
          guesser={whoGuesser(state)}
          team={setup.mode === "teams" ? names[side] : null}
          round={whoRound(state)}
          rounds={setup.rounds}
          onStart={() => dispatch({ type: "begin", rng: Math.random, at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "turn") {
    if (!state.card) return null;
    return (
      <GameFrame cover>
        <WhoTurn
          key={state.turnsPlayed}
          card={state.card}
          turnMs={state.turnMs}
          usedMs={state.usedMs}
          runningSince={state.runningSince}
          onAnswer={(result) => dispatch({ type: "answer", result, rng: Math.random, at: Date.now() })}
          onTick={tick}
          onPause={pause}
          onResume={resume}
        />
      </GameFrame>
    );
  }

  if (phase === "summary") {
    return (
      <GameFrame>
        <WhoSummary
          key={state.turnsPlayed}
          side={side}
          endedAt={state.endedAt}
          results={state.results}
          names={names}
          colors={colors}
          scores={whoScores(state)}
          onFlip={(index) => dispatch({ type: "flip", index, at: Date.now() })}
          onNext={() => dispatch({ type: "next", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <WhoEnd
        names={names}
        colors={colors}
        scores={state.scores}
        onPlayAgain={() => dispatch({ type: "playAgain", rng: Math.random, at: Date.now() })}
        onNewGame={() => {
          setDraft(setup);
          dispatch({ type: "newGame", at: Date.now() });
        }}
      />
    </GameFrame>
  );
}
