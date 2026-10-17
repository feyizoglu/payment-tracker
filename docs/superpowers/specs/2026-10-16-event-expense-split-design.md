# Event expense splitting

## Goal

Split the costs of a shared event (a trip, a dinner) between friends: everyone records what they paid and who it was for, and the app works out who pays whom to settle up. Available on the web and in the mobile app.

## Decisions

- Registered participants see the event in their own account and can add expenses and payments. People without an account are added by name and exist only inside the event.
- A registered participant is picked from the user's team members, or added by the email of any registered user (the same lookup as the team invite). Unregistered people are added by name.
- An expense is split equally among the selected participants by default, or by an exact amount per person that must add up to the expense total.
- Each expense has its own currency (`TRY`, `USD`, `EUR`, `GBP`, the app's `ALLOWED_CURRENCIES`). Balances and settle-up are computed per currency; nothing is converted.
- A settle-up transfer can be recorded as paid, in full or in part. Recorded payments feed back into the balances.

## Data model

New tables in `supabase-schema.sql`. Amounts are integers in minor units (kuruş, cents).

- `events`: `id`, `name` (not blank), `event_date` (date, nullable), `created_by` → users, `status` (`open` | `closed`, default `open`), `created_at`.
- `event_participants`: `id`, `event_id` → events (cascade), `user_id` → users (nullable), `display_name` (nullable), `created_at`. Exactly one of `user_id` and `display_name` is set (check constraint). Unique `(event_id, user_id)` where `user_id` is not null. The creator is added as a participant when the event is created.
- `event_expenses`: `id`, `event_id` (cascade), `description` (not blank), `amount_minor` (> 0), `currency` (one of the allowed four), `paid_by` → event_participants, `spent_on` (date), `created_by` → users, `created_at`.
- `event_expense_shares`: `expense_id` → event_expenses (cascade), `participant_id` → event_participants, `amount_minor` (>= 0); primary key `(expense_id, participant_id)`. Equal splits are stored as their computed amounts, so the shares of an expense always sum to its `amount_minor`.
- `event_settlements`: `id`, `event_id` (cascade), `from_participant`, `to_participant` (different), `amount_minor` (> 0), `currency`, `created_by` → users, `created_at`.

RLS is enabled on every new table with no policies: only the server's service-role client reads or writes them, so the public anon key cannot reach event data.

## Shared logic (`shared/split.ts`, no JSX)

- `splitEqually(totalMinor, participantIds)`: equal shares; the leftover minor units go one each to the first participants in the given order (100.00 over three: 33.34, 33.33, 33.33). The server passes participants in join order (`created_at`, then `id`).
- `balances(expenses, settlements)`: per currency, per participant, `paid − share + sent − received` (a positive balance is owed money).
- `suggestTransfers(balances)`: per currency, repeatedly match the largest debtor with the largest creditor for the smaller of the two amounts until all balances are zero. Deterministic: ties break by participant id.
- `formatMinor(amountMinor, currency, locale)` for display.

Unit-tested in `shared/` with vitest (equal split remainder, exact split validation, multi-currency, partial settlement, everyone already even).

## API (Next.js route handlers, `getSessionUser` auth like `/api/teams`)

Every route checks that the signed-in user is a registered participant of the event and returns 404 otherwise, so an outsider cannot learn the event exists.

- `GET /api/events`: events where the user is a participant, with the user's own net balance per currency.
- `POST /api/events`: `{ name, event_date? }`; creates the event and its creator participant.
- `GET /api/events/[id]`: the event with participants (with user name and colour), expenses with shares, and settlements, in one response.
- `PATCH /api/events/[id]`: `name`, `event_date`, `status`; creator only.
- `DELETE /api/events/[id]`: creator only.
- `POST /api/events/[id]/participants`: `{ user_id }` (must share a team with the caller), `{ email }` (any registered user), or `{ display_name }`.
- `DELETE /api/events/[id]/participants/[pid]`: refused with 409 when the participant appears in any expense, share or settlement; the creator cannot be removed.
- `POST /api/events/[id]/expenses`: `{ description, amount_minor, currency, paid_by, spent_on, split: { kind: "equal", participant_ids } | { kind: "exact", shares: [{ participant_id, amount_minor }] } }`. The server computes equal shares with `splitEqually`, and rejects exact shares that do not sum to `amount_minor`, participants from another event, or an empty split.
- `PUT` and `DELETE /api/events/[id]/expenses/[eid]`: any participant.
- `POST /api/events/[id]/settlements`: `{ from_participant, to_participant, amount_minor, currency }`.
- `DELETE /api/events/[id]/settlements/[sid]`: undo a recorded payment.

Shared response and request types go in `shared/types.ts`.

## Web

- New "Events" entry next to the existing dashboard and economy pages: `src/app/events/page.tsx` (list, create) and `src/app/events/[id]/page.tsx` (detail).
- Detail page sections: participants (add from teams, by email, or by name); expenses (list, add, edit, delete); balances per currency; suggested transfers, each with a "Paid" button that records a settlement for the full amount and an option to enter a smaller amount; recorded payments with undo.
- Expense form: description, amount, currency, paid by, date, participants (all selected by default), equal or exact split; the exact split shows the remaining amount until it reaches zero.
- All texts in `shared/i18n.ts` (`en` and `tr`).

## Mobile

- A fifth tab "Events" in `mobile/src/app/(app)/` with the same list, detail and expense form as the web, built from the existing `components/ui` primitives and calling the same API.
- Logic stays in `shared/split.ts` and `mobile/src/lib/`; screens are checked on the device.

## Delivery

Two plans, two PRs:

1. Schema, `shared/split.ts`, API, web.
2. Mobile tab.

The schema change is applied by running the new SQL in the Supabase SQL editor before the web deploy.

## Out of scope

- Linking a by-name participant to an account later.
- Percentage or share-ratio splits.
- Converting currencies.
- Notifications about new expenses or debts.
