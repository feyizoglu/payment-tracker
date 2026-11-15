"use client";

import { useEffect, useReducer, useState } from "react";
import { localeFor, useLang } from "@/lib/i18n";
import { WORD_GAME_WORDS } from "@/lib/word-game-words";
import {
  CLUE_SETUP_STORAGE_KEY,
  clueGiverSeat,
  clueGiverSeats,
  clueGuesser,
  clueGuesserSeat,
  clueReducer,
  clueScore,
  clueSeenKey,
  clueWord,
  defaultClueSetup,
  fillTemplate,
  initialClueState,
  parseSavedClueSeen,
  parseSavedClueSetup,
  playerColor,
  survivingClues,
  validateClueSetup,
  type ClueSetup,
} from "@/lib/clue-game";
import GameFrame from "../GameFrame";
import ClueCheck from "./ClueCheck";
import ClueEnd from "./ClueEnd";
import ClueGate from "./ClueGate";
import ClueGuess from "./ClueGuess";
import ClueHandoff from "./ClueHandoff";
import ClueResult from "./ClueResult";
import ClueSetupWizard from "./ClueSetupWizard";
import ClueWrite from "./ClueWrite";

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
export default function ClueGame() {
  const { t, lang } = useLang();
  // A saved setup's names are checked with the rules of the language the page opened in.
  const [openLang] = useState(lang);
  const [state, dispatch] = useReducer(clueReducer, undefined, () => initialClueState(defaultClueSetup()));
  const [draft, setDraft] = useState<ClueSetup>(defaultClueSetup);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const stored = parseSavedClueSetup(read(CLUE_SETUP_STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(stored);
    setPlayed(validateClueSetup(stored, localeFor(openLang)).length === 0);
  }, [openLang]);

  const { phase, setup, words, seen, round } = state;
  useEffect(() => {
    if (words && (phase === "result" || phase === "end")) write(clueSeenKey(state.lang), JSON.stringify(seen));
  }, [phase, words, seen, state.lang]);

  // Only a game the reducer started is remembered: a refused Start leaves the setup and the
  // wizard as they were. Play again saves the same setup again.
  useEffect(() => {
    if (phase !== "handoff" || round !== 0) return;
    write(CLUE_SETUP_STORAGE_KEY, JSON.stringify(setup));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayed(true);
    setStep(0);
  }, [phase, round, setup]);

  if (phase === "setup") {
    return (
      <GameFrame>
        <ClueSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() =>
            dispatch({
              type: "start",
              setup: draft,
              lang,
              words: WORD_GAME_WORDS[lang],
              seen: parseSavedClueSeen(read(clueSeenKey(lang))),
              rng: Math.random,
              at: Date.now(),
            })
          }
        />
      </GameFrame>
    );
  }

  if (phase === "end") {
    return (
      <GameFrame>
        <ClueEnd
          results={state.results}
          onPlayAgain={() => dispatch({ type: "playAgain", rng: Math.random, at: Date.now() })}
          onNewGame={() => {
            setDraft(setup);
            dispatch({ type: "newGame", at: Date.now() });
          }}
        />
      </GameFrame>
    );
  }

  const word = clueWord(state);
  if (!word) return null;
  const guesser = clueGuesser(state);
  const guesserColor = playerColor(clueGuesserSeat(state));
  const reveal = () => dispatch({ type: "reveal", at: Date.now() });

  if (phase === "handoff") {
    return (
      <GameFrame color={guesserColor}>
        <ClueHandoff
          guesser={guesser}
          next={setup.players[clueGiverSeats(state)[0]]}
          round={round + 1}
          total={state.deck.length}
          score={clueScore(state.results)}
          onBegin={() => dispatch({ type: "begin", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "clue") {
    const seat = clueGiverSeat(state);
    return (
      <GameFrame color={playerColor(seat)}>
        <ClueWrite
          key={`${state.turns}-${state.giver}`}
          giver={setup.players[seat]}
          word={word.word}
          revealed={state.revealed}
          onReveal={reveal}
          onSubmit={(text) => dispatch({ type: "submit", text, at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "check") {
    return (
      <GameFrame>
        {state.revealed ? (
          <ClueCheck
            word={word.word}
            guesser={guesser}
            clues={state.clues}
            onStrike={(index) => dispatch({ type: "strike", index, at: Date.now() })}
            onDone={() => dispatch({ type: "toGuess", at: Date.now() })}
          />
        ) : (
          <ClueGate
            title={t.clueCheckTitle}
            hint={fillTemplate(t.clueCheckHint, { name: guesser })}
            label={t.clueShowClues}
            onReveal={reveal}
          />
        )}
      </GameFrame>
    );
  }

  if (phase === "guess") {
    return (
      <GameFrame color={guesserColor}>
        {state.revealed ? (
          <ClueGuess
            guesser={guesser}
            clues={survivingClues(state.clues)}
            onAnswer={(outcome) => dispatch({ type: "answer", outcome, at: Date.now() })}
          />
        ) : (
          <ClueGate
            onColor
            title={fillTemplate(t.clueGuessGate, { name: guesser })}
            hint={t.clueGuessGateHint}
            label={t.clueShowClues}
            onReveal={reveal}
          />
        )}
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <ClueResult
        result={state.results[state.results.length - 1]}
        round={round + 1}
        total={state.deck.length}
        score={clueScore(state.results)}
        onNext={() => dispatch({ type: "next", at: Date.now() })}
      />
    </GameFrame>
  );
}
