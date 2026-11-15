"use client";

import { useLang } from "@/lib/i18n";
import {
  GAME_THEME,
  WHO_KINDS,
  WHO_KIND_EMOJI,
  WHO_KIND_KEYS,
  WHO_LEVEL_CHOICES,
  WHO_LEVEL_KEYS,
  WHO_REGION_CHOICES,
  WHO_REGION_KEYS,
  playerColor,
  type WhoKind,
  type WhoSetup,
} from "@/lib/who-game";
import WhoChoice from "./WhoChoice";

export default function WhoCardsStep({
  value,
  onChange,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
}) {
  const { t } = useLang();
  const toggle = (kind: WhoKind) =>
    onChange({ ...value, kinds: WHO_KINDS.filter((k) => (k === kind) !== value.kinds.includes(k)) });
  // Things have no region: the choice shows only while people or characters are on.
  const regional = value.kinds.some((k) => k !== "things");

  return (
    <div className="space-y-5">
      <div role="group" aria-label={t.whoKinds} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.whoKinds}</h3>
        {WHO_KINDS.map((kind, i) => {
          const active = value.kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(kind)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                active ? "ring-4 ring-white" : "opacity-60 hover:opacity-90"
              }`}
              style={{ backgroundColor: playerColor(2 * i + 1), color: GAME_THEME.ink }}
            >
              <span className="text-3xl" aria-hidden>
                {WHO_KIND_EMOJI[kind]}
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{t[WHO_KIND_KEYS[kind].label]}</span>
                <span className="block text-sm">{t[WHO_KIND_KEYS[kind].hint]}</span>
              </span>
              <span className="text-xl font-bold" aria-hidden>
                {active ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
      {regional && (
        <WhoChoice
          label={t.whoRegion}
          hint={t.whoRegionHint}
          options={WHO_REGION_CHOICES.map((region) => ({ value: region, label: t[WHO_REGION_KEYS[region]] }))}
          value={value.region}
          onPick={(region) => onChange({ ...value, region })}
        />
      )}
      <WhoChoice
        label={t.whoLevel}
        options={WHO_LEVEL_CHOICES.map((level) => ({ value: level, label: t[WHO_LEVEL_KEYS[level]] }))}
        value={value.level}
        onPick={(level) => onChange({ ...value, level })}
      />
    </div>
  );
}
