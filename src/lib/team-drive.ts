import { prisma } from "@/lib/prisma";

const KEY = "teamDriveFolderUrl";
const RE = /\/folders\/([a-zA-Z0-9_-]+)/;

/**
 * Resolve the admin-configured team Drive folder to a `{ id, url }` pair
 * (or null if no setting / unparseable). The Setting stores a URL; we
 * extract the folder id so it can be used as a picker root.
 */
export async function getTeamDriveFolder(): Promise<{
  id: string;
  url: string;
} | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const url = row?.value?.trim();
  if (!url) return null;
  const m = url.match(RE);
  if (!m) return null;
  return { id: m[1], url };
}
