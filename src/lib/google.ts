import { google } from "googleapis";
import { prisma } from "./prisma";

/**
 * Build a Google OAuth2 client using a user's stored access/refresh token.
 * Returns null if the user has no Google account linked.
 */
export async function googleClientForUser(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) return null;

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Auto-refresh — when googleapis refreshes, persist the new tokens.
  oauth2.on("tokens", async (tokens) => {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        refresh_token: tokens.refresh_token ?? account.refresh_token,
        expires_at: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : account.expires_at,
      },
    });
  });

  return oauth2;
}

export async function driveForUser(userId: string) {
  const auth = await googleClientForUser(userId);
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

export async function calendarForUser(userId: string) {
  const auth = await googleClientForUser(userId);
  if (!auth) return null;
  return google.calendar({ version: "v3", auth });
}
