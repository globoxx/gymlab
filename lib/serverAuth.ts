import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Fetch the authenticated user id from the session.
 * Returns an object on success, or a NextResponse (401) on failure so callers can early-return.
 */
export async function requireUserId(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || typeof session.user !== "object" || !("id" in session.user)) {
    return { response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }
  return { userId: session.user.id as string };
}
