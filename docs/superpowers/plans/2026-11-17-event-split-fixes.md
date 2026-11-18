# Event split fixes

Three open review advisories from PR #3: a settlement can exceed the current debt, `GET /api/events` makes four queries per event, and email lookups are case-sensitive. Each fix ships as its own PR because they have different deploy orders. Merging to `main` deploys to Vercel at once, while Supabase SQL is applied by the owner by hand.

## 1. Batch the event list (no SQL)

**Problem:** `GET /api/events` (`src/app/api/events/route.ts:17`) calls `loadEventDetail` once per event. That is about four queries for each event the user is in.

**Change:**
- Add `loadMyEvents(db, userId)` to `src/lib/events-repo.ts`; it returns each event's rows and the route computes `my_balance`. It makes four queries in total, whatever the number of events:
  1. `event_participants` with `id, event_id` for the user. This gives the user's participant id per event, so no participant or user join is needed.
  2. `events` with `.in("id", ids)`.
  3. `event_expenses` with shares, using `.in("event_id", ids)`.
  4. `event_settlements` with `.in("event_id", ids)`.
- Return early with `[]` when `ids` is empty.
- Group rows by `event_id`; the route computes `my_balance` with the existing `balances()`.
- Keep the response shape and the `created_at` sort. `loadEventDetail` stays for the detail route.

**Tests first:**
- The route returns the same summaries as before.
- The repo is called once rather than once per event.
- An empty list returns `[]`.

**Known limit:** the Supabase API row cap (default 1000 rows per query, check it in the project settings) applies to the batched expense and settlement queries. Above it, `my_balance` would be computed from truncated rows without any error. That is far above this app's size, so this plan only records the limit.

**Deploy:** normal PR, no gate on the owner.

## 2. Cap a settlement at the current debt (SQL first)

**Problem:** `POST /api/events/[id]/settlements` inserts any amount between two participants. If two clients press "Paid" on the same suggestion, two settlements are recorded and the debtor ends up owed money. A check in the route does not fix this: both requests read the same balances before either inserts.

**Rule:** for the settlement's currency, `from` must currently owe (balance < 0) and `to` must be owed (balance > 0). The amount must be at most `min(-balance[from], balance[to])`. The balance follows the convention of `balances()` in `shared/split.ts`: paid − share + sent − received, positive means owed money. `suggestTransfers` never proposes more than this, so the full and partial "Paid" flows on web and mobile keep passing.

**SQL (owner runs it in Supabase; also added to `supabase-schema.sql`):**
- `event_participant_balance(p_event_id uuid, p_participant uuid, p_currency text) returns bigint`. It sums paid expenses, minus shares (joined through `event_expenses` for the currency), plus settlements sent, minus settlements received.
- `event_settlement_insert(p_event_id, p_created_by, p_from, p_to, p_amount_minor, p_currency) returns event_settlements`:
  1. `select … from events where id = p_event_id for update`. This serialises settlements per event.
  2. Compute both balances.
  3. If the rule fails, `raise exception 'settlement exceeds debt' using errcode = 'P0409'`.
  4. Otherwise insert and return the row.
- It has the same shape as the existing RPCs: `language plpgsql`, `set search_path = public`, and `revoke all … from public, anon, authenticated` with the exact signature.

**Code:**
- `insertSettlement` calls the RPC. On error code `P0409` it throws a `SettlementExceedsDebt` error.
- The route maps that error to `409 "Amount is more than the current debt"`. The 201 body is unchanged.
- Web `SettleUp`: on a 409, show the error and call `onChanged()` so the stale suggestion is refetched. Today it keeps the old suggestion. Mobile already refetches on 409.

**Tests first:**
- Route: 409 when the repo throws `SettlementExceedsDebt`; 201 unchanged otherwise.
- Repo: maps `P0409` to that error and any other error to a failure.
- Web `SettleUp`: refetches on 409.

**Verification gap:** the route tests mock Supabase, so neither CI nor the gates run the SQL or the lock. To check the concurrent path, the function has to run against a real database, either a Supabase branch or a local `supabase start`. Without one, the double-press case stays unverified, and the report will say so.

**Deploy gate:** the owner runs the SQL **before** this PR merges. Code that calls a missing RPC would break recording payments in production.

## 3. Case-insensitive email (data first)

**Problem:** `users.email` is `unique` and case-sensitive.
- The team invite looks the email up with `.eq` (`src/app/api/teams/[id]/invite/route.ts:42`). Inviting `Ali@Gmail.com` therefore fails for a user stored as `ali@gmail.com`.
- Two rows that differ only in case would make the events lookup (`findUserByEmail`, `ilike` with `maybeSingle`) fail with a 500.

**Step 0, owner runs and reports the result:**

```sql
select email from users where email <> lower(email);
select lower(email), count(*) from users group by lower(email) having count(*) > 1;
```

If the second query returns any rows, stop. Merging duplicate users is a separate decision.

**Order (each step only after the previous one is live):**
1. Owner runs `update users set email = lower(email) where email <> lower(email);`.
2. Code PR: lowercase the email wherever it is written or looked up:
   - `src/auth.ts` (upsert and session lookup)
   - `src/app/api/auth/mobile/route.ts` (upsert)
   - `src/app/api/teams/[id]/invite/route.ts` (lookup)
   - `findUserByEmail`, where `ilike` becomes `eq` on the lowercased input; the wildcard escaping is then no longer needed.
3. Owner runs `alter table users add constraint users_email_lowercase check (email = lower(email));`. The existing `unique(email)` then acts as case-insensitive, and the `onConflict: "email"` upserts keep working. Add the constraint to `supabase-schema.sql` too.

Lowercasing in code before the data is normalised would make an upsert miss a mixed-case row and create a second user with a new id. That is why step 1 comes first.

**Tests first:**
- Invite finds the user for a mixed-case address.
- Both sign-in upserts send a lowercased email.
- `findUserByEmail` queries the lowercased address.
