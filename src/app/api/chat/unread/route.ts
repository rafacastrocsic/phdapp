import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeUnreadByChannel } from "@/lib/chat-access";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0, byChannel: {} });
  const { total, byChannel } = await computeUnreadByChannel(session.user.id);
  return NextResponse.json({ count: total, byChannel });
}
