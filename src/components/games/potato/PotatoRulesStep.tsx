"use client";

import { useLang } from "@/lib/i18n";
import {
  FUSE_LABEL_KEYS,
  FUSE_SECONDS,
  LIVES_CHOICES,
  POTATO_FUSES,
  POTATO_TASK_MODES,
  TASK_MODE_KEYS,
  fillTemplate,
  type PotatoSetup,
} from "@/lib/hot-potato";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

const card = (active: boolean) =>
  `block w-full rounded-xl border-2 bg-surface p-3 text-left transition ${
    active ? "border-white" : "border-gray-100 opacity-60 hover:opacity-90"
  }`;

export default function PotatoRulesStep({
  value,
  onChange,
}: {
  value: PotatoSetup;
  onChange: (next: PotatoSetup) => void;
}) {
  const { t } = useLang();
  const set = (patch: Partial<PotatoSetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <div role="group" aria-label={t.potatoLives} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.potatoLives}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {LIVES_CHOICES.map((lives) => (
            <button
              key={lives}
              type="button"
              aria-pressed={value.lives === lives}
              className={pill(value.lives === lives)}
              onClick={() => set({ lives })}
            >
              {lives}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label={t.potatoFuse} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.potatoFuse}</h3>
        <div className="flex gap-2">
          {POTATO_FUSES.map((fuse) => {
            const [min, max] = FUSE_SECONDS[fuse];
            return (
              <button
                key={fuse}
                type="button"
                aria-pressed={value.fuse === fuse}
                onClick={() => set({ fuse })}
                className={`${card(value.fuse === fuse)} flex-1 text-center`}
              >
                <span className="block font-semibold text-gray-900">{t[FUSE_LABEL_KEYS[fuse]]}</span>
                <span className="block text-sm text-gray-500">
                  {fillTemplate(t.potatoFuseRange, { min: String(min), max: String(max) })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div role="group" aria-label={t.potatoTasks} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.potatoTasks}</h3>
        {POTATO_TASK_MODES.map((tasks) => (
          <button
            key={tasks}
            type="button"
            aria-pressed={value.tasks === tasks}
            onClick={() => set({ tasks })}
            className={card(value.tasks === tasks)}
          >
            <span className="block font-semibold text-gray-900">{t[TASK_MODE_KEYS[tasks].label]}</span>
            <span className="block text-sm text-gray-500">{t[TASK_MODE_KEYS[tasks].hint]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
