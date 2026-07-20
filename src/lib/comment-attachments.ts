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

// ───────── Document-style comments (ordered blocks) ─────────
//
// A comment can be an ordered sequence of blocks that interleave text and
// files exactly as the author arranged them — "like writing a document".

export type CommentBlock =
  | { type: "text"; text: string }
  | {
      type: "file";
      name: string;
      url: string;
      mimeType?: string;
      size?: number;
    };

export const BlockInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(20000) }),
  z.object({
    type: z.literal("file"),
    name: z.string().min(1).max(300),
    url: z.string().url(),
    mimeType: z.string().max(200).optional(),
    size: z.number().int().nonnegative().optional(),
  }),
]);
export type BlockInputT = z.infer<typeof BlockInput>;

// Validate + normalise incoming blocks: drop empty text blocks, keep only
// file blocks whose URL is one of our own Blob uploads, and cap the total.
export function sanitiseBlocks(blocks: BlockInputT[]): CommentBlock[] {
  const out: CommentBlock[] = [];
  let files = 0;
  for (const b of blocks) {
    if (out.length >= 200) break;
    if (b.type === "text") {
      if (b.text.trim().length === 0) continue;
      out.push({ type: "text", text: b.text });
    } else {
      if (files >= 20) continue;
      if (!isOwnBlobUrl(b.url)) continue;
      files += 1;
      out.push({
        type: "file",
        name: b.name.slice(0, 300),
        url: b.url,
        mimeType: b.mimeType,
        size: b.size,
      });
    }
  }
  return out;
}

// Plain-text projection of the blocks — used for notification previews and
// any text search. Text blocks joined by blank lines.
export function blocksToText(blocks: CommentBlock[]): string {
  return blocks
    .filter((b): b is Extract<CommentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

// Flat attachment list derived from the file blocks, so the existing
// "attachments" column + rendering keep working.
export function blocksToAttachments(blocks: CommentBlock[]): CommentAttachment[] {
  return blocks
    .filter((b): b is Extract<CommentBlock, { type: "file" }> => b.type === "file")
    .map((b) => ({
      name: b.name,
      url: b.url,
      mimeType: b.mimeType,
      size: b.size,
    }));
}

export function parseBlocks(
  raw: string | null | undefined,
): CommentBlock[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    const out: CommentBlock[] = [];
    for (const b of j) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "text" && typeof b.text === "string") {
        out.push({ type: "text", text: b.text });
      } else if (
        b.type === "file" &&
        typeof b.url === "string" &&
        typeof b.name === "string"
      ) {
        out.push({
          type: "file",
          name: b.name,
          url: b.url,
          mimeType: typeof b.mimeType === "string" ? b.mimeType : undefined,
          size: typeof b.size === "number" ? b.size : undefined,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
