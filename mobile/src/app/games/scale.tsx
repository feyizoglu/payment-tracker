import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useReducer, useState, type ReactNode } from "react";
import { ActivityIndicator, BackHandler } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  defaultScaleSetup,
  defaultTeamNames,
  initialScaleState,
  scaleClueGiver,
  scaleReducer,
  scaleTeam,
  scaleTurn,
  teamColor,
  validateScaleSetup,
  type ScaleSetup,
} from "@ptracker/shared/scale-game";
import { SCALE_PAIRS } from "@ptracker/shared/scale-pairs";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { ScaleEnd } from "@/components/games/scale/scale-end";
import { ScaleGuess } from "@/components/games/scale/scale-guess";
import { ScaleHandoff } from "@/components/games/scale/scale-handoff";
import { ScaleReveal } from "@/components/games/scale/scale-reveal";
import { ScaleSecret } from "@/components/games/scale/scale-secret";
import { ScaleSetupWizard } from "@/components/games/scale/scale-setup";
import { getStoredScaleSeen, getStoredScaleSetup, setStoredScaleSeen, setStoredScaleSetup } from "@/lib/scale-game-storage";
import { useConfirmLeave } from "@/lib/leave-game";

export default function ScaleScreen() {
  const { t, lang } = useLang();
  // The default team names, and the name rules a saved setup is checked with, follow the
  // language the screen opened in.
  const [teamNames] = useState(() => defaultTeamNames(t.wordTeamDefault));
  const [openLang] = useState(lang);
  const [state, dispatch] = useReducer(scaleReducer, undefined, () => initialScaleState(defaultScaleSetup(teamNames)));
  const [draft, setDraft] = useState<ScaleSetup | null>(null);
  // This device's pairs played in `lang`. Updated on every save, so the next game never starts
  // from a copy older than the last turn.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();
  const focused = useIsFocused();
  const move = useCallback((needle: number) => dispatch({ type: "move", needle, at: Date.now() }), []);

  useEffect(() => {
    getStoredScaleSetup(teamNames).then((saved) => {
      setDraft(saved);
      setPlayed(validateScaleSetup(saved, localeFor(openLang)).length === 0);
    });
  }, [teamNames, openLang]);

  useEffect(() => {
    let live = true;
    // Until this language's list is read, no game may start with the last language's list.
    setSeen(null);
    getStoredScaleSeen(lang).then((ids) => {
      if (live) setSeen(ids);
    });
    return () => {
      live = false;
    };
  }, [lang]);

  const { phase, setup, pair, pairs, used } = state;
  useEffect(() => {
    if (pairs.length === 0 || (phase !== "reveal" && phase !== "end")) return;
    void setStoredScaleSeen(state.lang, used);
    if (state.lang === lang) setSeen(used);
  }, [phase, pairs, used, state.lang, lang]);

  // Only a game the reducer started is remembered: a refused Start leaves the setup and the
  // wizard as they were. Play again saves the same setup again.
  useEffect(() => {
    if (phase !== "handoff" || state.turnsPlayed !== 0) return;
    void setStoredScaleSetup(setup);
    setPlayed(true);
    setStep(0);
  }, [phase, state.turnsPlayed, setup]);

  // Android's back button and back gesture would end the turn while the target is shown or the
  // needle is moved. Only while this screen is on top: the game-mode PIN screen over it keeps
  // its back.
  const midTurn = phase === "secret" || phase === "guess";
  useEffect(() => {
    if (!midTurn || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [midTurn, focused]);

  // Outside the blocked turn, back asks first once the game has started.
  const inProgress = phase !== "setup" && phase !== "end";
  useConfirmLeave(inProgress && !midTurn);

  if (!pinReady) return <GamesPinSetup title={t.scaleTitle} />;

  const team = scaleTeam(state);
  const teamName = setup.teams[team].name;
  let body: ReactNode = null;

  if (phase === "setup") {
    body =
      draft && seen ? (
        <ScaleSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() =>
            dispatch({ type: "start", setup: draft, lang, pairs: SCALE_PAIRS[lang], seen, at: Date.now() })
          }
        />
      ) : (
        <ActivityIndicator />
      );
  } else if (phase === "handoff") {
    body = (
      <ScaleHandoff
        team={teamName}
        giver={scaleClueGiver(state)}
        turn={scaleTurn(state)}
        turns={setup.turns}
        teams={setup.teams}
        scores={state.scores}
        onShow={() => dispatch({ type: "show", rng: Math.random, at: Date.now() })}
      />
    );
  } else if (phase === "secret" && pair) {
    body = <ScaleSecret pair={pair} target={state.target} onHide={() => dispatch({ type: "hide", at: Date.now() })} />;
  } else if (phase === "guess" && pair) {
    body = (
      <ScaleGuess
        pair={pair}
        team={teamName}
        color={teamColor(team)}
        needle={state.needle}
        confirming={state.confirming}
        onMove={move}
        onLock={() => dispatch({ type: "lock", at: Date.now() })}
      />
    );
  } else if (phase === "reveal" && pair) {
    body = (
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
    );
  } else if (phase === "end") {
    body = (
      <ScaleEnd
        teams={setup.teams}
        scores={state.scores}
        onPlayAgain={() => dispatch({ type: "playAgain", at: Date.now() })}
        onNewGame={() => {
          setDraft(setup);
          dispatch({ type: "newGame", at: Date.now() });
        }}
      />
    );
  }

  return (
    <GameScreen
      title={t.scaleTitle}
      tone="game"
      color={phase === "handoff" ? teamColor(team) : undefined}
      scroll={phase === "setup" || phase === "reveal" || phase === "end"}
      nav={!midTurn}
      confirmBack={inProgress}>
      {body}
    </GameScreen>
  );
}
