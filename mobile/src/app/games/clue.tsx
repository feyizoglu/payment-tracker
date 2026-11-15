import { useEffect, useReducer, useState, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  clueGiverSeat,
  clueGiverSeats,
  clueGuesser,
  clueGuesserSeat,
  clueReducer,
  clueScore,
  clueWord,
  defaultClueSetup,
  fillTemplate,
  initialClueState,
  playerColor,
  survivingClues,
  validateClueSetup,
  type ClueSetup,
} from "@ptracker/shared/clue-game";
import { WORD_GAME_WORDS } from "@ptracker/shared/word-game-words";
import { ClueCheck } from "@/components/games/clue/clue-check";
import { ClueEnd } from "@/components/games/clue/clue-end";
import { ClueGate } from "@/components/games/clue/clue-gate";
import { ClueGuess } from "@/components/games/clue/clue-guess";
import { ClueHandoff } from "@/components/games/clue/clue-handoff";
import { ClueResult } from "@/components/games/clue/clue-result";
import { ClueSetupWizard } from "@/components/games/clue/clue-setup";
import { ClueWrite } from "@/components/games/clue/clue-write";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { getStoredClueSeen, getStoredClueSetup, setStoredClueSeen, setStoredClueSetup } from "@/lib/clue-game-storage";

export default function ClueScreen() {
  const { t, lang } = useLang();
  // A saved setup's names are checked with the rules of the language the screen opened in.
  const [openLang] = useState(lang);
  const [state, dispatch] = useReducer(clueReducer, undefined, () => initialClueState(defaultClueSetup()));
  const [draft, setDraft] = useState<ClueSetup | null>(null);
  // This device's seen list in `lang`. Updated on every save, so the next game never starts
  // from a copy older than the last round.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();

  useEffect(() => {
    getStoredClueSetup().then((saved) => {
      setDraft(saved);
      setPlayed(validateClueSetup(saved, localeFor(openLang)).length === 0);
    });
  }, [openLang]);

  useEffect(() => {
    let live = true;
    // Until this language's list is read, no game may start with the last language's list.
    setSeen(null);
    getStoredClueSeen(lang).then((ids) => {
      if (live) setSeen(ids);
    });
    return () => {
      live = false;
    };
  }, [lang]);

  const { phase, setup, words, round } = state;
  useEffect(() => {
    if (!words || (phase !== "result" && phase !== "end")) return;
    void setStoredClueSeen(state.lang, state.seen);
    if (state.lang === lang) setSeen(state.seen);
  }, [phase, words, state.lang, state.seen, lang]);

  // Only a game the reducer started is remembered: a refused Start leaves the setup and the
  // wizard as they were. Play again saves the same setup again.
  useEffect(() => {
    if (phase !== "handoff" || round !== 0) return;
    void setStoredClueSetup(setup);
    setPlayed(true);
    setStep(0);
  }, [phase, round, setup]);

  if (!pinReady) return <GamesPinSetup title={t.clueTitle} />;

  const word = clueWord(state);
  const guesser = phase === "setup" ? "" : clueGuesser(state);
  const guesserColor = phase === "setup" ? undefined : playerColor(clueGuesserSeat(state));
  const reveal = () => dispatch({ type: "reveal", at: Date.now() });
  let body: ReactNode = null;
  let color: string | undefined;

  if (phase === "setup") {
    body =
      draft && seen ? (
        <ClueSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() =>
            dispatch({ type: "start", setup: draft, lang, words: WORD_GAME_WORDS[lang], seen, rng: Math.random, at: Date.now() })
          }
        />
      ) : (
        <ActivityIndicator />
      );
  } else if (phase === "handoff") {
    color = guesserColor;
    body = (
      <ClueHandoff
        guesser={guesser}
        next={setup.players[clueGiverSeats(state)[0]]}
        round={round + 1}
        total={state.deck.length}
        score={clueScore(state.results)}
        onBegin={() => dispatch({ type: "begin", at: Date.now() })}
      />
    );
  } else if (phase === "clue" && word) {
    const seat = clueGiverSeat(state);
    color = playerColor(seat);
    body = (
      <ClueWrite
        key={`${state.turns}-${state.giver}`}
        giver={setup.players[seat]}
        word={word.word}
        revealed={state.revealed}
        onReveal={reveal}
        onSubmit={(text) => dispatch({ type: "submit", text, at: Date.now() })}
      />
    );
  } else if (phase === "check" && word) {
    body = state.revealed ? (
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
    );
  } else if (phase === "guess") {
    color = guesserColor;
    body = state.revealed ? (
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
    );
  } else if (phase === "result") {
    body = (
      <ClueResult
        result={state.results[state.results.length - 1]}
        round={round + 1}
        total={state.deck.length}
        score={clueScore(state.results)}
        onNext={() => dispatch({ type: "next", at: Date.now() })}
      />
    );
  } else if (phase === "end") {
    body = (
      <ClueEnd
        results={state.results}
        onPlayAgain={() => dispatch({ type: "playAgain", rng: Math.random, at: Date.now() })}
        onNewGame={() => {
          setDraft(setup);
          dispatch({ type: "newGame", at: Date.now() });
        }}
      />
    );
  }

  return (
    <GameScreen title={t.clueTitle} tone="game" color={color} scroll={phase !== "handoff"}>
      {body}
    </GameScreen>
  );
}
