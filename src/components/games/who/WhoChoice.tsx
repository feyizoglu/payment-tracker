"use client";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

// One setting picked from a few options, the current one pressed.
export default function WhoChoice<T extends string | number>({
  label,
  hint,
  options,
  value,
  onPick,
}: {
  label: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <h3 className="text-sm font-medium text-gray-500">{label}</h3>
      <div className="flex rounded-lg bg-gray-100 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            className={pill(o.value === value)}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
