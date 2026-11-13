import { useCallback, useEffect, useReducer, useState, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  currentTeam,
  defaultTeamNames,
  defaultWordSetup,
  describer,
  initialWordState,
  teamColor,
  validateWordSetup,
  wordGameReducer,
  type WordSetup,
} from "@ptracker/shared/word-game";
import { WORD_GAME_WORDS } from "@ptracker/shared/word-game-words";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { WordEnd } from "@/components/games/word/word-end";
import { WordHandoff } from "@/components/games/word/word-handoff";
import { WordSetupWizard } from "@/components/games/word/word-setup";
import { WordSummary } from "@/components/games/word/word-summary";
import { WordTurn } from "@/components/games/word/word-turn";
import { getStoredSeen, getStoredWordSetup, setStoredSeen, setStoredWordSetup } from "@/lib/word-game-storage";

export default function WordScreen() {
  const { t, lang } = useLang();
  // The default team names, and the name rules a saved setup is checked with, follow the
  // language the screen opened in.
  const [teamNames] = useState(() => defaultTeamNames(t.wordTeamDefault));
  const [nameLocale] = useState(() => localeFor(lang));
  const [state, dispatch] = useReducer(wordGameReducer, undefined, () => initialWordState(defaultWordSetup(teamNames)));
  const [draft, setDraft] = useState<WordSetup | null>(null);
  // This device's seen list in `lang`. Updated on every save, so the next game never starts
  // from a copy older than the last turn.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();
  const timeUp = useCallback(() => dispatch({ type: "timeUp", at: Date.now() }), []);

  useEffect(() => {
    getStoredWordSetup(teamNames).then((saved) => {
      setDraft(saved);
      setPlayed(validateWordSetup(saved, nameLocale).length === 0);
    });
  }, [teamNames, nameLocale]);

  useEffect(() => {
    let live = true;
    getStoredSeen(lang).then((ids) => {
      if (live) setSeen(ids);
    });
    return () => {
      live = false;
    };
  }, [lang]);

  const { phase, setup, words } = state;
  useEffect(() => {
    if (!words || (phase !== "summary" && phase !== "end")) return;
    void setStoredSeen(state.lang, state.seen);
    if (state.lang === lang) setSeen(state.seen);
  }, [phase, words, state.lang, state.seen, lang]);

  if (!pinReady) return <GamesPinSetup title={t.wordTitle} />;

  const team = currentTeam(state);
  let body: ReactNode = null;

  if (phase === "setup") {
    body =
      draft && seen ? (
        <WordSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            void setStoredWordSetup(draft);
            setPlayed(true);
            setStep(0);
            dispatch({ type: "start", setup: draft, lang, words: WORD_GAME_WORDS[lang], seen, rng: Math.random, at: Date.now() });
          }}
        />
      ) : (
        <ActivityIndicator />
      );
  } else if (phase === "handoff") {
    body = (
      <WordHandoff
        describer={describer(state)}
        teamName={setup.teams[team].name}
        teams={setup.teams}
        scores={state.scores}
        onBegin={() => dispatch({ type: "begin", at: Date.now() })}
        onEnd={() => dispatch({ type: "endGame", at: Date.now() })}
      />
    );
  } else if (phase === "play" && state.card) {
    body = (
      <WordTurn
        key={state.turnsPlayed}
        card={state.card}
        teamName={setup.teams[team].name}
        mode={setup.mode}
        endsAt={state.endsAt}
        passLimit={setup.passLimit}
        passesLeft={state.passesLeft}
        onAnswer={(result) => dispatch({ type: "answer", result, rng: Math.random, at: Date.now() })}
        onTimeUp={timeUp}
      />
    );
  } else if (phase === "summary") {
    body = (
      <WordSummary
        team={team}
        teams={setup.teams}
        scores={state.scores}
        results={state.results}
        outOfWords={state.outOfWords}
        onNext={() => dispatch({ type: "next", at: Date.now() })}
        onEnd={() => dispatch({ type: "endGame", at: Date.now() })}
      />
    );
  } else if (phase === "end") {
    body = (
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
    );
  }

  // The hand-over and the turn belong to one team: the screen takes that team's colour.
  const teamTurn = phase === "handoff" || phase === "play";
  return (
    <GameScreen
      title={t.wordTitle}
      tone="game"
      color={teamTurn ? teamColor(team) : undefined}
      scroll={phase !== "play"}>
      {body}
    </GameScreen>
  );
}
