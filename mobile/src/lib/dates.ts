// Local-time conversions between a Date and the 'yyyy-MM-dd' / 'yyyy-MM' strings the
// API speaks. Deliberately not `toISOString().slice(0,10)`: that shifts to UTC and can
// land the user on the previous day. Mirrors the web form's localDateStr helper.
//
// Distinct from `dayKey` in occurrences.ts, which is an unpadded grouping key and is
// not a wire format.

export function toIsoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// Parses 'yyyy-MM-dd' as a local-midnight Date. Returns today for a malformed or
// empty input so a picker always has something to open on.
export function fromIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toIsoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Splits 'yyyy-MM' into its parts; null when empty or malformed (the "no end month"
// case the recurring form allows).
export function parseIsoMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

export function dayOfIsoDate(value: string): number {
  return Number(value.slice(8, 10));
}

// Year range the month picker offers: always spans from the earlier of the current
// value's year and today's year through `yearSpan` past the later one, so an already
// stored past or far-future month is still selectable.
export function monthPickerYears(value: string, today: Date, yearSpan: number): number[] {
  const currentYear = today.getFullYear();
  const baseYear = parseIsoMonth(value)?.year ?? currentYear;

  const years: number[] = [];
  for (let year = Math.min(baseYear, currentYear); year <= Math.max(baseYear, currentYear) + yearSpan; year++) {
    years.push(year);
  }
  return years;
}

// Setting one half of an unset 'yyyy-MM' fills the other half from today, so the user
// can never produce a half-written month.
export function withMonthPickerYear(value: string, year: string, today: Date): string {
  const parsed = parseIsoMonth(value);
  const month = parsed?.month ?? today.getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function withMonthPickerMonth(value: string, month: string, today: Date): string {
  const parsed = parseIsoMonth(value);
  return `${parsed?.year ?? today.getFullYear()}-${month}`;
}
