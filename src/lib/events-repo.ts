import { supabaseAdmin } from "@/lib/supabase";
import type {
  EventDetail,
  EventExpenseShare,
  EventParticipant,
  EventSettlement,
  EventStatus,
  ExpenseInput,
  SplitEvent,
} from "@/types";

type Db = ReturnType<typeof supabaseAdmin>;

function fail(context: string, error: { message: string }): never {
  console.error(`events-repo ${context}:`, error);
  throw new Error(error.message);
}

const PARTICIPANT_COLUMNS = "id, event_id, user_id, display_name, created_at, user:users(id, name, email, color)";

// The caller's own participant row in an event, or null when they are not in it.
export async function findMyParticipant(db: Db, eventId: string, userId: string): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("event_participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("findMyParticipant", error);
  return data;
}

export async function getEvent(db: Db, eventId: string): Promise<SplitEvent | null> {
  const { data, error } = await db.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) fail("getEvent", error);
  return data;
}

export async function listParticipants(db: Db, eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await db
    .from("event_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at")
    .order("id");
  if (error) fail("listParticipants", error);
  return (data ?? []) as unknown as EventParticipant[];
}

export async function loadEventDetail(db: Db, eventId: string): Promise<EventDetail | null> {
  const event = await getEvent(db, eventId);
  if (!event) return null;
  const [participants, expenses, settlements] = await Promise.all([
    listParticipants(db, eventId),
    db
      .from("event_expenses")
      .select("*, shares:event_expense_shares(participant_id, amount_minor)")
      .eq("event_id", eventId)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
    db.from("event_settlements").select("*").eq("event_id", eventId).order("created_at"),
  ]);
  if (expenses.error) fail("loadEventDetail expenses", expenses.error);
  if (settlements.error) fail("loadEventDetail settlements", settlements.error);
  return { ...event, participants, expenses: expenses.data ?? [], settlements: settlements.data ?? [] };
}

// Events the user takes part in, newest first.
export async function listMyEventIds(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db.from("event_participants").select("event_id").eq("user_id", userId);
  if (error) fail("listMyEventIds", error);
  return (data ?? []).map((r: { event_id: string }) => r.event_id);
}

export async function createEvent(db: Db, userId: string, name: string, eventDate: string | null): Promise<SplitEvent> {
  const { data, error } = await db
    .from("events")
    .insert({ name, event_date: eventDate, created_by: userId })
    .select()
    .single();
  if (error) fail("createEvent", error);
  const { error: pErr } = await db.from("event_participants").insert({ event_id: data.id, user_id: userId });
  if (pErr) {
    await db.from("events").delete().eq("id", data.id);
    fail("createEvent participant", pErr);
  }
  return data;
}

export async function updateEvent(
  db: Db,
  eventId: string,
  patch: Partial<{ name: string; event_date: string | null; status: EventStatus }>
): Promise<void> {
  const { error } = await db.from("events").update(patch).eq("id", eventId);
  if (error) fail("updateEvent", error);
}

export async function deleteEvent(db: Db, eventId: string): Promise<void> {
  const { error } = await db.from("events").delete().eq("id", eventId);
  if (error) fail("deleteEvent", error);
}

export async function findUserByEmail(db: Db, email: string): Promise<{ id: string } | null> {
  const { data, error } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (error) fail("findUserByEmail", error);
  return data;
}

// True when the two users are members of at least one common team.
export async function shareATeam(db: Db, a: string, b: string): Promise<boolean> {
  const { data, error } = await db.from("team_members").select("team_id, user_id").in("user_id", [a, b]);
  if (error) fail("shareATeam", error);
  const teamsOf = (u: string) => new Set((data ?? []).filter((r) => r.user_id === u).map((r) => r.team_id));
  const mine = teamsOf(a);
  return [...teamsOf(b)].some((t) => mine.has(t));
}

// Returns null when the user is already in the event (unique index).
export async function addParticipant(
  db: Db,
  eventId: string,
  who: { user_id: string } | { display_name: string }
): Promise<EventParticipant | null> {
  const { data, error } = await db
    .from("event_participants")
    .insert({ event_id: eventId, ...who })
    .select(PARTICIPANT_COLUMNS)
    .single();
  if (error?.code === "23505") return null;
  if (error) fail("addParticipant", error);
  return data as unknown as EventParticipant;
}

export async function participantIsReferenced(db: Db, participantId: string): Promise<boolean> {
  const checks = await Promise.all([
    db.from("event_expenses").select("id", { count: "exact", head: true }).eq("paid_by", participantId),
    db.from("event_expense_shares").select("expense_id", { count: "exact", head: true }).eq("participant_id", participantId),
    db.from("event_settlements").select("id", { count: "exact", head: true }).eq("from_participant", participantId),
    db.from("event_settlements").select("id", { count: "exact", head: true }).eq("to_participant", participantId),
  ]);
  for (const c of checks) if (c.error) fail("participantIsReferenced", c.error);
  return checks.some((c) => (c.count ?? 0) > 0);
}

export async function deleteParticipant(db: Db, participantId: string): Promise<void> {
  const { error } = await db.from("event_participants").delete().eq("id", participantId);
  if (error) fail("deleteParticipant", error);
}

export async function insertExpense(
  db: Db,
  eventId: string,
  userId: string,
  input: Omit<ExpenseInput, "split">,
  shares: EventExpenseShare[]
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("event_expenses")
    .insert({ event_id: eventId, created_by: userId, ...input })
    .select("id")
    .single();
  if (error) fail("insertExpense", error);
  const { error: sErr } = await db.from("event_expense_shares").insert(shares.map((s) => ({ expense_id: data.id, ...s })));
  if (sErr) {
    await db.from("event_expenses").delete().eq("id", data.id);
    fail("insertExpense shares", sErr);
  }
  return data;
}

export async function replaceExpense(
  db: Db,
  expenseId: string,
  input: Omit<ExpenseInput, "split">,
  shares: EventExpenseShare[]
): Promise<void> {
  const { error } = await db.from("event_expenses").update(input).eq("id", expenseId);
  if (error) fail("replaceExpense", error);
  const { error: dErr } = await db.from("event_expense_shares").delete().eq("expense_id", expenseId);
  if (dErr) fail("replaceExpense delete shares", dErr);
  const { error: sErr } = await db.from("event_expense_shares").insert(shares.map((s) => ({ expense_id: expenseId, ...s })));
  if (sErr) fail("replaceExpense shares", sErr);
}

export async function expenseEventId(db: Db, expenseId: string): Promise<string | null> {
  const { data, error } = await db.from("event_expenses").select("event_id").eq("id", expenseId).maybeSingle();
  if (error) fail("expenseEventId", error);
  return data?.event_id ?? null;
}

export async function deleteExpense(db: Db, expenseId: string): Promise<void> {
  const { error } = await db.from("event_expenses").delete().eq("id", expenseId);
  if (error) fail("deleteExpense", error);
}

export async function insertSettlement(
  db: Db,
  eventId: string,
  userId: string,
  s: Pick<EventSettlement, "from_participant" | "to_participant" | "amount_minor" | "currency">
): Promise<EventSettlement> {
  const { data, error } = await db
    .from("event_settlements")
    .insert({ event_id: eventId, created_by: userId, ...s })
    .select()
    .single();
  if (error) fail("insertSettlement", error);
  return data;
}

export async function settlementEventId(db: Db, settlementId: string): Promise<string | null> {
  const { data, error } = await db.from("event_settlements").select("event_id").eq("id", settlementId).maybeSingle();
  if (error) fail("settlementEventId", error);
  return data?.event_id ?? null;
}

export async function deleteSettlement(db: Db, settlementId: string): Promise<void> {
  const { error } = await db.from("event_settlements").delete().eq("id", settlementId);
  if (error) fail("deleteSettlement", error);
}
