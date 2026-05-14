"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Plus,
  Hash,
  MessagesSquare,
  Search,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  Paperclip,
  X as XIcon,
  FileText,
  FileSpreadsheet,
  File as FileIcon,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, relativeTime, displayName } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  kind: string;
  color: string;
  student: { id: string; fullName: string; alias: string | null; color: string } | null;
  memberCount: number;
  members: { id: string; name: string | null; image: string | null; color: string }[];
}
interface Attachment {
  name: string;
  url: string;
  mimeType: string;
  size: number;
}
interface Message {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null; color: string };
  attachments?: Attachment[];
}
interface Member {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
  role: string;
}

export function ChatView({
  meId,
  meRole,
  channels: initialChannels,
  teamMembers,
  students,
  initialChannelId,
  initialStudentId,
  initialUnreadByChannel = {},
}: {
  meId: string;
  meRole: string;
  channels: Channel[];
  teamMembers: Member[];
  students: { id: string; fullName: string; alias: string | null; color: string }[];
  initialChannelId: string | null;
  initialStudentId: string | null;
  initialUnreadByChannel?: Record<string, number>;
}) {
  const canDeleteChannel = meRole !== "student";
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>(initialUnreadByChannel);
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const initialId =
    initialChannelId ??
    channels.find((c) => initialStudentId && c.student?.id === initialStudentId)?.id ??
    channels[0]?.id ??
    null;
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;

  // Load + poll messages for active channel.
  // Mark as read when opening the channel and whenever the tab is visible
  // and we get new messages (so a real viewer's badge clears, but the badge
  // grows when the user is on a different page/tab).
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastMessageCount = 0;

    async function markRead() {
      await fetch(`/api/channels/${activeId}/read`, { method: "POST" });
      // optimistically clear the per-channel badge
      setUnreadByChannel((prev) => ({ ...prev, [activeId!]: 0 }));
      // refresh authoritative counts
      const r = await fetch("/api/chat/unread", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j.byChannel) setUnreadByChannel(j.byChannel);
      }
    }

    // Initial open: explicit "I'm here, clear unread"
    markRead();

    async function tick() {
      const r = await fetch(`/api/channels/${activeId}/messages`);
      if (!cancelled && r.ok) {
        const j = await r.json();
        setMessages(j.messages);
        // Auto-mark as read only while the tab is actually visible AND new
        // messages have arrived since last poll.
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible" &&
          j.messages.length > lastMessageCount
        ) {
          markRead();
        }
        lastMessageCount = j.messages.length;
      }
      // refresh per-channel unread map so other channels' badges update
      const u = await fetch("/api/chat/unread", { cache: "no-store" });
      if (!cancelled && u.ok) {
        const j = await u.json();
        if (j.byChannel) setUnreadByChannel(j.byChannel);
      }
      if (!cancelled) timer = setTimeout(tick, 3500);
    }
    tick();

    // When the tab regains visibility, mark read.
    function onVisibility() {
      if (document.visibilityState === "visible") markRead();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const filteredChannels = useMemo(
    () =>
      channels.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [channels, search],
  );

  async function renameActiveChannel() {
    if (!active) return;
    const name = window.prompt("New channel name", active.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === active.name) return;
    const r = await fetch(`/api/channels/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not rename");
      return;
    }
    setChannels((prev) =>
      prev.map((c) => (c.id === active.id ? { ...c, name: trimmed } : c)),
    );
  }

  async function deleteActiveChannel() {
    if (!active) return;
    if (
      !window.confirm(
        `Delete the channel “${active.name}”?\n\nThis removes all of its messages and cannot be undone.`,
      )
    )
      return;
    const r = await fetch(`/api/channels/${active.id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not delete");
      return;
    }
    setChannels((prev) => prev.filter((c) => c.id !== active.id));
    setActiveId(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId) return;
    if (!body.trim() && pendingAttachments.length === 0) return;
    const text = body;
    const atts = pendingAttachments.slice();
    setBody("");
    setPendingAttachments([]);
    // optimistic
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        body: text,
        createdAt: new Date().toISOString(),
        author: {
          id: meId,
          name: "You",
          image: null,
          color: "#6366f1",
        },
        attachments: atts,
      },
    ]);
    const r = await fetch(`/api/channels/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, attachments: atts }),
    });
    if (r.ok) {
      const { message } = await r.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? message : m)),
      );
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    setUploading(true);
    try {
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/chat/upload", { method: "POST", body: fd });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          alert(j.error ?? `Upload failed for ${f.name}`);
          continue;
        }
        const meta = (await r.json()) as Attachment;
        setPendingAttachments((prev) => [...prev, meta]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removePendingAttachment(idx: number) {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <aside className="w-72 shrink-0 border-r bg-white flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase text-slate-500">
              Channels
            </h2>
            <NewChannelDialog
              students={students}
              teamMembers={teamMembers}
              onCreated={(c) => {
                setChannels((prev) => [c, ...prev]);
                setActiveId(c.id);
              }}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Find channel…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!h-8 !pl-8 !text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredChannels.length === 0 ? (
            <p className="text-xs text-slate-400 p-4 text-center">No channels yet.</p>
          ) : (
            filteredChannels.map((c) => {
              const unread = unreadByChannel[c.id] ?? 0;
              const hasUnread = unread > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50",
                    activeId === c.id && "bg-slate-100",
                  )}
                >
                  {hasUnread && (
                    <span
                      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--c-pink)] px-1.5 text-[10px] font-bold text-white"
                      title={`${unread} unread message${unread === 1 ? "" : "s"}`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                    style={{ background: `${c.color}1f`, color: c.color }}
                  >
                    {iconFor(c.kind)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm truncate",
                        hasUnread ? "font-bold text-slate-900" : "font-medium text-slate-900",
                      )}
                    >
                      {c.name}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {channelKindLabel(c.kind)} · {c.memberCount} member
                      {c.memberCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-50">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Pick a channel.
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b bg-white flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: `${active.color}1f`, color: active.color }}
              >
                {iconFor(active.kind)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 truncate">
                  {active.name}
                </div>
                <div className="text-xs text-slate-500">
                  {channelKindLabel(active.kind)}
                  {active.student && (
                    <> · about {displayName(active.student)}</>
                  )}
                </div>
              </div>
              <div className="flex -space-x-2">
                {active.members.slice(0, 5).map((m) => (
                  <Avatar
                    key={m.id}
                    name={m.name}
                    src={m.image}
                    color={m.color}
                    size="xs"
                  />
                ))}
                {active.members.length > 5 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-2 ring-white">
                    +{active.members.length - 5}
                  </span>
                )}
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    title="Channel actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-[180px] rounded-xl border bg-white p-1 shadow-lg"
                  >
                    <DropdownMenu.Item
                      onSelect={renameActiveChannel}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 outline-none"
                    >
                      <Pencil className="h-4 w-4 text-slate-500" />
                      Rename channel
                    </DropdownMenu.Item>
                    {canDeleteChannel && (
                      <>
                        <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                        <DropdownMenu.Item
                          onSelect={deleteActiveChannel}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--c-red)] hover:bg-red-50 focus:bg-red-50 outline-none"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete channel
                        </DropdownMenu.Item>
                      </>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-2">
              {messages.length === 0 ? (
                <div className="text-center text-sm text-slate-400 mt-12">
                  No messages yet — say hi 👋
                </div>
              ) : (
                messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const sameAuthor = prev?.author.id === m.author.id;
                  const mine = m.author.id === meId;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex gap-2",
                        mine && "flex-row-reverse",
                      )}
                    >
                      <div className="w-8 shrink-0">
                        {!sameAuthor && (
                          <Avatar
                            name={m.author.name}
                            src={m.author.image}
                            color={m.author.color}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className={cn("max-w-[70%]", mine && "text-right")}>
                        {!sameAuthor && (
                          <div
                            className={cn(
                              "text-xs text-slate-500 mb-0.5",
                              mine && "text-right",
                            )}
                          >
                            <span className="font-semibold text-slate-700">
                              {mine ? "You" : m.author.name}
                            </span>{" "}
                            · {format(new Date(m.createdAt), "HH:mm")}
                          </div>
                        )}
                        {m.body && (
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 text-sm shadow-sm whitespace-pre-wrap",
                              mine
                                ? "bg-[var(--c-violet)] text-white rounded-tr-sm"
                                : "bg-white text-slate-800 rounded-tl-sm border",
                            )}
                          >
                            {m.body}
                          </div>
                        )}
                        {m.attachments && m.attachments.length > 0 && (
                          <div
                            className={cn(
                              "mt-1 flex flex-col gap-1.5",
                              mine ? "items-end" : "items-start",
                            )}
                          >
                            {m.attachments.map((a, i) => (
                              <AttachmentBlock key={i} att={a} mine={mine} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={send} className="border-t bg-white p-3 space-y-2">
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((a, i) => (
                    <PendingAttachmentChip
                      key={i}
                      att={a}
                      onRemove={() => removePendingAttachment(i)}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      uploadFiles(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                  title="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <Input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    uploading
                      ? "Uploading…"
                      : `Message #${active.name}`
                  }
                  className="!h-10"
                />
                <Button
                  type="submit"
                  variant="brand"
                  size="md"
                  disabled={
                    uploading ||
                    (!body.trim() && pendingAttachments.length === 0)
                  }
                >
                  <Send className="h-4 w-4" /> Send
                </Button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function PendingAttachmentChip({
  att,
  onRemove,
}: {
  att: Attachment;
  onRemove: () => void;
}) {
  const isImage = att.mimeType.startsWith("image/");
  return (
    <div className="relative flex items-center gap-2 rounded-lg border bg-slate-50 p-1.5 pr-7 text-xs">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={att.url}
          alt={att.name}
          className="h-10 w-10 rounded object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-white border text-slate-500">
          <FileIconFor mime={att.mimeType} />
        </span>
      )}
      <div className="min-w-0">
        <div className="font-medium text-slate-900 truncate max-w-[140px]">
          {att.name}
        </div>
        <div className="text-[10px] text-slate-500">{prettySize(att.size)}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        title="Remove"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

function AttachmentBlock({ att, mine }: { att: Attachment; mine: boolean }) {
  const isImage = att.mimeType.startsWith("image/");
  if (isImage) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener"
        className="block max-w-[260px] rounded-xl overflow-hidden border bg-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={att.url} alt={att.name} className="block max-w-full" />
        <div className="px-2 py-1 text-[10px] text-slate-500 truncate">
          {att.name} · {prettySize(att.size)}
        </div>
      </a>
    );
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener"
      download={att.name}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 max-w-[260px] hover:shadow-sm transition-shadow",
        mine
          ? "bg-[var(--c-violet)] text-white border-transparent"
          : "bg-white",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          mine ? "bg-white/20" : "bg-slate-100 text-slate-600",
        )}
      >
        <FileIconFor mime={att.mimeType} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{att.name}</div>
        <div
          className={cn(
            "text-[10px]",
            mine ? "text-white/80" : "text-slate-500",
          )}
        >
          {prettySize(att.size)}
        </div>
      </div>
      <Download className="h-3.5 w-3.5 opacity-70" />
    </a>
  );
}

function FileIconFor({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime.includes("spreadsheet") || mime.includes("excel"))
    return <FileSpreadsheet className="h-4 w-4" />;
  if (mime.includes("pdf") || mime.includes("document") || mime.startsWith("text/"))
    return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(kind: string) {
  if (kind === "cosupervisors") return <Users className="h-4 w-4" />;
  if (kind === "general") return <Hash className="h-4 w-4" />;
  return <MessagesSquare className="h-4 w-4" />;
}

function channelKindLabel(kind: string) {
  return (
    {
      student: "Student channel",
      cosupervisors: "Other supervisors",
      direct: "Direct message",
      general: "General",
    } as Record<string, string>
  )[kind] ?? kind;
}

function NewChannelDialog({
  students,
  teamMembers,
  onCreated,
}: {
  students: { id: string; fullName: string; alias: string | null; color: string }[];
  teamMembers: Member[];
  onCreated: (c: Channel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("cosupervisors");
  const [memberIds, setMemberIds] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    payload.memberIds = JSON.stringify(memberIds);
    const r = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not create channel");
      return;
    }
    const { channel } = await r.json();
    onCreated(channel);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="New channel"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Channel name">
            <Input name="name" required placeholder="e.g. Co-sups · Ada Lovelace" />
          </Field>
          <Field label="Kind">
            <Select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="cosupervisors">Other supervisors</option>
              <option value="student">With student</option>
              <option value="general">General</option>
              <option value="direct">Direct message</option>
            </Select>
          </Field>
          <Field label="Linked student (optional)">
            <Select name="studentId" defaultValue="">
              <option value="">None</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{displayName(s)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Members">
            <div className="rounded-lg border max-h-40 overflow-y-auto p-2 space-y-1 bg-white">
              {teamMembers.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(m.id)}
                    onChange={(e) => {
                      setMemberIds((prev) =>
                        e.target.checked
                          ? [...prev, m.id]
                          : prev.filter((id) => id !== m.id),
                      );
                    }}
                  />
                  <Avatar name={m.name} src={m.image} color={m.color} size="xs" />
                  <span className="flex-1 truncate">{m.name}</span>
                  <Badge color={m.color}>{m.role}</Badge>
                </label>
              ))}
            </div>
          </Field>
          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// keep relativeTime referenced (used by tooltips/inspectors)
void relativeTime;
