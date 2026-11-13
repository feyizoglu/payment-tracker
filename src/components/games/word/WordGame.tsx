"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useLang } from "@/lib/i18n";
import { WORD_GAME_WORDS } from "@/lib/word-game-words";
import {
  WORD_SETUP_STORAGE_KEY,
  currentTeam,
  defaultTeamNames,
  defaultWordSetup,
  describer,
  initialWordState,
  parseSavedSeen,
  parseSavedWordSetup,
  teamColor,
  validateWordSetup,
  wordGameReducer,
  wordSeenKey,
  type WordSetup,
} from "@/lib/word-game";
import GameFrame from "../GameFrame";
import WordEnd from "./WordEnd";
import WordHandoff from "./WordHandoff";
import WordSetupWizard from "./WordSetupWizard";
import WordSummary from "./WordSummary";
import WordTurn from "./WordTurn";

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
export default function WordGame() {
  const { t, lang } = useLang();
  // The default team names follow the language the page opened in.
  const [teamNames] = useState(() => defaultTeamNames(t.wordTeamDefault));
  const [state, dispatch] = useReducer(wordGameReducer, undefined, () => initialWordState(defaultWordSetup(teamNames)));
  const [draft, setDraft] = useState<WordSetup>(() => defaultWordSetup(teamNames));
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const timeUp = useCallback(() => dispatch({ type: "timeUp", at: Date.now() }), []);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const saved = parseSavedWordSetup(read(WORD_SETUP_STORAGE_KEY), teamNames);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    setPlayed(validateWordSetup(saved).length === 0);
  }, [teamNames]);

  const { phase, setup, words, seen } = state;
  useEffect(() => {
    if (words && (phase === "summary" || phase === "end")) write(wordSeenKey(state.lang), JSON.stringify(seen));
  }, [phase, words, seen, state.lang]);

  const team = currentTeam(state);

  if (phase === "setup") {
    return (
      <GameFrame>
        <WordSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            write(WORD_SETUP_STORAGE_KEY, JSON.stringify(draft));
            setPlayed(true);
            setStep(0);
            dispatch({
              type: "start",
              setup: draft,
              lang,
              words: WORD_GAME_WORDS[lang],
              seen: parseSavedSeen(read(wordSeenKey(lang))),
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
      <GameFrame color={teamColor(team)}>
        <WordHandoff
          describer={describer(state)}
          teamName={setup.teams[team].name}
          teams={setup.teams}
          scores={state.scores}
          onBegin={() => dispatch({ type: "begin", at: Date.now() })}
          onEnd={() => dispatch({ type: "endGame", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "play") {
    if (!state.card) return null;
    return (
      <GameFrame color={teamColor(team)}>
        <WordTurn
          key={state.turnsPlayed}
          card={state.card}
          mode={setup.mode}
          endsAt={state.endsAt}
          passLimit={setup.passLimit}
          passesLeft={state.passesLeft}
          onAnswer={(result) => dispatch({ type: "answer", result, rng: Math.random, at: Date.now() })}
          onTimeUp={timeUp}
        />
      </GameFrame>
    );
  }

  if (phase === "summary") {
    return (
      <GameFrame>
        <WordSummary
          team={team}
          teams={setup.teams}
          scores={state.scores}
          results={state.results}
          outOfWords={state.outOfWords}
          onNext={() => dispatch({ type: "next", at: Date.now() })}
          onEnd={() => dispatch({ type: "endGame", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <WordEnd
        teams={setup.teams}
        scores={state.scores}
        outOfWords={state.outOfWords}
        onPlayAgain={() => dispatch({ type: "playAgain", rng: Math.random, at: Date.now() })}
        onNewGame={() => {
          setDraft(state.setup);
          dispatch({ type: "newGame", at: Date.now() });
        }}
      />
    </GameFrame>
  );
}
