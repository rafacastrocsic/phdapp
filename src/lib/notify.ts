import { prisma } from "./prisma";

/**
 * Create in-app notifications for users (the 🔔 bell + unread count) and
 * best-effort email them if Resend is configured. Never throws — callers
 * fire-and-forget. Skips notifying the actor themselves.
 */
export async function notify(
  userIds: (string | null | undefined)[],
  opts: { type: string; message: string; link?: string; actorId?: string },
): Promise<void> {
  const targets = Array.from(
    new Set(
      userIds.filter(
        (u): u is string => !!u && u !== opts.actorId,
      ),
    ),
  );
  if (targets.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        userId,
        type: opts.type,
        message: opts.message,
        link: opts.link ?? null,
      })),
    });
  } catch (err) {
    console.error("notify: db insert failed", err);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const recipients = await prisma.user.findMany({
      where: { id: { in: targets }, email: { not: "" } },
      select: { email: true },
    });
    if (recipients.length === 0) return;
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const from = process.env.DIGEST_FROM || "PhDapp <onboarding@resend.dev>";
    const url = opts.link
      ? `https://phdapp.vercel.app${opts.link}`
      : "https://phdapp.vercel.app";
    await Promise.allSettled(
      recipients.map((r) =>
        resend.emails.send({
          from,
          to: r.email,
          subject: "PhDapp notification",
          html: `<p>${opts.message}</p><p><a href="${url}">Open in PhDapp →</a></p>`,
        }),
      ),
    );
  } catch (err) {
    console.error("notify: email failed", err);
  }
}
