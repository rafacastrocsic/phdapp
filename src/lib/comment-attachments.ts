import { z } from "zod";

// Email-style attachments on a comment: images + documents, stored as a JSON
// array on Comment.attachments and uploaded to permanent Blob storage.

export interface CommentAttachment {
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
}

export const AttachmentInput = z.object({
  name: z.string().min(1).max(300),
  url: z.string().url(),
  mimeType: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});
export type AttachmentInputT = z.infer<typeof AttachmentInput>;

// Only accept URLs that came from our own Vercel Blob storage — stops a
// crafted POST from embedding arbitrary external images/links as
// "attachments" (tracking pixels, spoofed files, etc.).
function isOwnBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith("blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export function sanitiseAttachments(
  list: AttachmentInputT[],
): CommentAttachment[] {
  return list
    .filter((a) => isOwnBlobUrl(a.url))
    .slice(0, 20)
    .map((a) => ({
      name: a.name.slice(0, 300),
      url: a.url,
      mimeType: a.mimeType,
      size: a.size,
    }));
}

export function parseAttachments(
  raw: string | null | undefined,
): CommentAttachment[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j
      .filter(
        (a) =>
          a && typeof a.url === "string" && typeof a.name === "string",
      )
      .map((a) => ({
        name: a.name as string,
        url: a.url as string,
        mimeType: typeof a.mimeType === "string" ? a.mimeType : undefined,
        size: typeof a.size === "number" ? a.size : undefined,
      }));
  } catch {
    return [];
  }
}
