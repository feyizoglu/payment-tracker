import { GAME_THEME, teamColor, type WordTeam } from "@/lib/word-game";

// Dark tiles with the team's colour as border and name: they read on the dark frame and on
// either team's colour.
export default function WordScores({ teams, scores }: { teams: readonly WordTeam[]; scores: readonly number[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {teams.map((team, i) => (
        <div
          key={i}
          className="rounded-xl border-2 p-3 text-center"
          style={{ backgroundColor: GAME_THEME.bg, borderColor: teamColor(i) }}
        >
          <p className="truncate text-sm font-semibold" style={{ color: teamColor(i) }}>
            {team.name}
          </p>
          <p className="text-3xl font-bold" style={{ color: GAME_THEME.text }}>
            {scores[i]}
          </p>
        </div>
      ))}
    </div>
  );
}
