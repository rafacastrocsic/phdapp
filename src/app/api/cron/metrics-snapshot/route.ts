import { NextResponse } from "next/server";
import { computeMetrics, recordSnapshot } from "@/lib/metrics";

// Daily adoption-metrics snapshot. Wired to a Vercel Cron (see
// vercel.json). Vercel automatically sends
// `Authorization: Bearer ${CRON_SECRET}` when the CRON_SECRET env var
// is set; we verify it when present and otherwise run unguarded so a
// fresh deploy works before the secret is configured (it only writes
// one analytics row, so an unauthenticated hit is harmless anyway).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const m = await computeMetrics();
    await recordSnapshot(m);
    return NextResponse.json({ ok: true, day: m.generatedAt });
  } catch (err) {
    console.error("metrics-snapshot cron failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "failed" },
      { status: 500 },
    );
  }
}
