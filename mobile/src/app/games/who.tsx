import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import { WHO_CHARACTERS, WHO_PEOPLE } from "@ptracker/shared/who-cards";
import {
  defaultTeamNames,
  defaultWhoSetup,
  initialWhoState,
  sideColor,
  validateWhoSetup,
  whoGuesser,
  whoPool,
  whoReducer,
  whoRound,
  whoScores,
  whoSide,
  type WhoSetup,
  type WhoSources,
} from "@ptracker/shared/who-game";
import { WHO_THINGS } from "@ptracker/shared/who-things";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { WhoEnd } from "@/components/games/who/who-end";
import { WhoHandoff } from "@/components/games/who/who-handoff";
import { WhoSetupWizard } from "@/components/games/who/who-setup";
import { WhoSummary } from "@/components/games/who/who-summary";
import { WhoTurn } from "@/components/games/who/who-turn";
import { getStoredWhoSeen, getStoredWhoSetup, setStoredWhoSeen, setStoredWhoSetup } from "@/lib/who-game-storage";

const SOURCES: WhoSources = { people: WHO_PEOPLE, characters: WHO_CHARACTERS, things: WHO_THINGS };

export default function WhoScreen() {
  const { t, lang } = useLang();
  // The default team names and region, and the name rules a saved setup is checked with,
  // follow the language the screen opened in.
  const [teamNames] = useState(() => defaultTeamNames(t.wordTeamDefault));
  const [openLang] = useState(lang);
  const [state, dispatch] = useReducer(whoReducer, undefined, () => initialWhoState(defaultWhoSetup(lang, teamNames)));
  const [draft, setDraft] = useState<WhoSetup | null>(null);
  // This device's seen list in `lang`. Updated on every save, so the next game never starts
  // from a copy older than the last turn.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();
  const tick = useCallback(() => dispatch({ type: "tick", at: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", at: Date.now() }), []);
  const resume = useCallback(() => dispatch({ type: "resume", at: Date.now() }), []);
  const kinds = draft?.kinds;
  const region = draft?.region;
  const level = draft?.level;
  const poolSize = useMemo(
    () => (kinds && region && level ? whoPool({ kinds, region, level }, SOURCES, lang).length : 0),
    [kinds, region, level, lang]
  );

  useEffect(() => {
    getStoredWhoSetup(openLang, teamNames).then((saved) => {
      setDraft(saved);
      setPlayed(validateWhoSetup(saved, localeFor(openLang), whoPool(saved, SOURCES, openLang).length).length === 0);
    });
  }, [teamNames, openLang]);

  useEffect(() => {
    let live = true;
    // Until this language's list is read, no game may start with the last language's list.
    setSeen(null);
    getStoredWhoSeen(lang).then((ids) => {
      if (live) setSeen(ids);
    });
    return () => {
      live = false;
    };
  }, [lang]);

  const { phase, setup, pool } = state;
  useEffect(() => {
    if (pool.length === 0 || (phase !== "summary" && phase !== "end")) return;
    void setStoredWhoSeen(state.lang, state.seen);
    if (state.lang === lang) setSeen(state.seen);
  }, [phase, pool, state.lang, state.seen, lang]);

  if (!pinReady) return <GamesPinSetup title={t.whoTitle} />;

  const names = setup.mode === "solo" ? setup.players : setup.teams.map((team) => team.name);
  const colors = names.map((_, i) => sideColor(setup.mode, i));
  const side = whoSide(state);
  let body: ReactNode = null;

  if (phase === "setup") {
    body =
      draft && seen ? (
        <WhoSetupWizard
          value={draft}
          onChange={setDraft}
          poolSize={poolSize}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            void setStoredWhoSetup(draft);
            setPlayed(true);
            setStep(0);
            dispatch({ type: "start", setup: draft, lang, sources: SOURCES, seen, rng: Math.random, at: Date.now() });
          }}
        />
      ) : (
        <ActivityIndicator />
      );
  } else if (phase === "handoff") {
    body = (
      <WhoHandoff
        guesser={whoGuesser(state)}
        team={setup.mode === "teams" ? names[side] : null}
        round={whoRound(state)}
        rounds={setup.rounds}
        onStart={() => dispatch({ type: "begin", rng: Math.random, at: Date.now() })}
      />
    );
  } else if (phase === "turn" && state.card) {
    body = (
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
    );
  } else if (phase === "summary") {
    body = (
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
    );
  } else if (phase === "end") {
    body = (
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
    );
  }

  return (
    <GameScreen
      title={t.whoTitle}
      tone="game"
      color={phase === "handoff" ? colors[side] : undefined}
      scroll={phase === "setup" || phase === "summary" || phase === "end"}>
      {body}
    </GameScreen>
  );
}
