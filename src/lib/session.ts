import { auth } from "@/auth";
import { verifyAppToken } from "@/lib/mobile-auth";

export interface SessionUser {
  id: string;
  email: string;
}

// Resolves the requesting user from either a mobile Bearer app-JWT or the
// NextAuth cookie session. Takes a web-standard Request (NextRequest extends it).
// An invalid Bearer token returns null outright — no cookie fallback.
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const payload = await verifyAppToken(header.slice("Bearer ".length));
    if (!payload) return null;
    return { id: payload.userId, email: payload.email };
  }

  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user?.email || !id) return null;
  return { id, email: session.user.email };
}
