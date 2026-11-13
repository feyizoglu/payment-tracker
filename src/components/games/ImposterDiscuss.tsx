"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, formatCountdown, remainingSeconds } from "@/lib/imposter";

export default function ImposterDiscuss({
  starter,
  starterColor,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  starterColor: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
  const { t } = useLang();
  const [endsAt] = useState(() => Date.now() + timerMinutes * 60_000);
  const [left, setLeft] = useState(timerMinutes * 60);

  useEffect(() => {
    if (timerMinutes === 0) return;
    const id = setInterval(() => setLeft(remainingSeconds(endsAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [endsAt, timerMinutes]);

  return (
    <div className="space-y-6 py-6 text-center">
      <p
        className="inline-block rounded-full px-5 py-2 text-2xl font-bold"
        style={{ backgroundColor: starterColor, color: GAME_THEME.ink }}
      >
        {t.imposterStarts.replace("{name}", () => starter)}
      </p>
      {timerMinutes > 0 && (
        <p className={`text-5xl font-mono ${left === 0 ? "text-red-600" : "text-gray-900"}`}>
          {left === 0 ? t.imposterTimeUp : formatCountdown(left)}
        </p>
      )}
      <button
        type="button"
        onClick={onFinish}
        className="rounded-lg bg-blue-600 px-10 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {voting ? t.imposterGoVote : t.imposterReveal}
      </button>
    </div>
  );
}
