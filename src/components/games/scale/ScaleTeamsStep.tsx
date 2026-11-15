"use client";

import { defaultWordSetup, type ScaleSetup, type WordSetup } from "@/lib/scale-game";
import WordTeamsStep from "../word/WordTeamsStep";

// Describe It's teams step edits a whole WordSetup but only touches its teams: it gets one
// built around ours, and only the teams come back.
function asWordSetup(setup: ScaleSetup): WordSetup {
  return { ...defaultWordSetup([setup.teams[0].name, setup.teams[1].name]), teams: setup.teams };
}

export default function ScaleTeamsStep({
  value,
  onChange,
}: {
  value: ScaleSetup;
  onChange: (next: ScaleSetup) => void;
}) {
  return <WordTeamsStep value={asWordSetup(value)} onChange={(next) => onChange({ ...value, teams: next.teams })} />;
}
