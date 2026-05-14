import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cleanupChatAttachments } from "@/lib/chat-cleanup";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const result = await cleanupChatAttachments();
  return NextResponse.json({ ok: true, ...result });
}
