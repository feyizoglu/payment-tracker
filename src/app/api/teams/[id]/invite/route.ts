import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { id: teamId } = await params;
  const { email } = await req.json();

  // Find user by email
  const { data: invitedUser, error: userError } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (userError || !invitedUser) {
    return NextResponse.json(
      { error: "User not found. They must sign in first." },
      { status: 404 }
    );
  }

  const { error } = await db.from("team_members").upsert({
    team_id: teamId,
    user_id: invitedUser.id,
    role: "member",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
