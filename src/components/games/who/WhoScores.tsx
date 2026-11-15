import { GAME_THEME } from "@/lib/who-game";

// Dark tiles with the side's colour as border and name, for players or teams.
export default function WhoScores({
  names,
  colors,
  scores,
}: {
  names: readonly string[];
  colors: readonly string[];
  scores: readonly number[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {names.map((name, i) => (
        <div
          key={i}
          className="rounded-xl border-2 p-3 text-center"
          style={{ backgroundColor: GAME_THEME.bg, borderColor: colors[i] }}
        >
          <p className="truncate text-sm font-semibold" style={{ color: colors[i] }}>
            {name}
          </p>
          <p className="text-3xl font-bold" style={{ color: GAME_THEME.text }}>
            {scores[i]}
          </p>
        </div>
      ))}
    </div>
  );
}
