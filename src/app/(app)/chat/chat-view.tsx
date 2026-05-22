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
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Bell,
  Reply,
  Volume2,
} from "lucide-react";

const CHANNELS_COLLAPSE_KEY = "phdapp.chat-channels-collapsed";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, relativeTime, displayName } from "@/lib/utils";
import {
  useSectionVersion,
  useUnread,
} from "@/components/app-shell/unread-provider";
import {
  playChatSound,
  getSoundType,
  getVolume,
  SOUND_KEY,
  VOL_KEY,
  type SoundType,
} from "@/lib/chat-sound";

interface Channel {
  id: string;
  name: string;
  kind: string;
  color: string;
  description?: string | null;
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
  // Non-null whenever the author has edited the body after the
  // initial send. The UI renders an "(edited)" suffix next to the
  // timestamp to make the history transparent.
  editedAt?: string | null;
  author: { id: string; name: string | null; image: string | null; color: string };
  attachments?: Attachment[];
  replyTo?: { id: string; body: string; authorName: string | null } | null;
}
interface Read {
  userId: string;
  name: string | null;
  image: string | null;
  color: string;
  lastRead: string;
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
  const [reads, setReads] = useState<Read[]>([]);
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setChannelsCollapsed(window.localStorage.getItem(CHANNELS_COLLAPSE_KEY) === "1");
  }, []);
  function toggleChannelsCollapsed() {
    setChannelsCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CHANNELS_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  // Inline edit-in-place state: id of the message currently being
  // edited (own messages only) and the working draft body. null = not
  // editing. Submitting calls PATCH and merges the response into
  // `messages`; Esc / Cancel discards changes.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;

  // WhatsApp-style delivery state for MY messages:
  //  - "sent"      → ✓  (grey)  : on the server, no other participant yet
  //  - "delivered" → ✓✓ (grey)  : another member exists (will receive it)
  //  - "seen"      → ✓✓ (blue)  : another member has read up to this message
  const otherReads = useMemo(
    () => reads.filter((r) => r.userId !== meId),
    [reads, meId],
  );
  function tickState(createdAt: string): "sent" | "delivered" | "seen" {
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return "sent";
    if (
      otherReads.some((r) => {
        const lr = new Date(r.lastRead).getTime();
        return !Number.isNaN(lr) && lr >= t;
      })
    )
      return "seen";
    return otherReads.length > 0 ? "delivered" : "sent";
  }

  // Load + poll messages for active channel.
  // Mark as read when opening the channel and whenever the tab is visible
  // and we get new messages (so a real viewer's badge clears, but the badge
  // grows when the user is on a different page/tab).
  // Version-gated chat refresh — replaces the old 12s poll.
  //
  // The UnreadProvider polls /api/unread every 20s while visible and
  // exposes chat.byChannel + a chat-wide version (max
  // Message.createdAt/editedAt across visible channels for peer
  // messages). We use those as the freshness signal:
  //
  //   - activeId change → mark read + initial messages fetch.
  //   - chat version changes  → refetch this channel's messages
  //                             (also catches peer edits anywhere).
  //   - byChannel[activeId] up → mark read (we just refetched and
  //                             rendered, so claim them seen).
  //
  // No setInterval, no setTimeout. Idle sessions where nobody is
  // sending messages generate exactly zero /api/channels/[id]/messages
  // fetches.
  const { refresh: refreshUnread, data: unreadData } = useUnread();
  const chatVersion = useSectionVersion("chat");
  const lastSeenChatVersionRef = useRef<string | null>(null);
  const messagesFetchInFlightRef = useRef(false);

  // Mirror provider's byChannel into local state so we can clear it
  // optimistically on channel-open before the provider's next poll.
  useEffect(() => {
    if (unreadData?.chat?.byChannel) {
      setUnreadByChannel(unreadData.chat.byChannel);
    }
  }, [unreadData?.chat?.byChannel]);

  async function markRead(channelId: string) {
    await fetch(`/api/channels/${channelId}/read`, { method: "POST" });
    setUnreadByChannel((prev) => ({ ...prev, [channelId]: 0 }));
    // Trigger a provider refresh so the canonical counts reflect the
    // mark-read without waiting up to 20s for the next tick.
    refreshUnread();
  }

  async function fetchActiveChannelMessages(channelId: string) {
    if (messagesFetchInFlightRef.current) return;
    messagesFetchInFlightRef.current = true;
    try {
      const r = await fetch(`/api/channels/${channelId}/messages`);
      if (r.ok) {
        const j = await r.json();
        setMessages(j.messages);
        setReads(j.reads ?? []);
      }
    } finally {
      messagesFetchInFlightRef.current = false;
    }
  }

  // (1) Channel switch — mark read, initial fetch, reset version
  // baseline so the next chatVersion tick is judged against this
  // moment, not against the previous channel's history.
  useEffect(() => {
    if (!activeId) return;
    lastSeenChatVersionRef.current = chatVersion;
    markRead(activeId);
    fetchActiveChannelMessages(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // (2) Refetch when chat version moves — peer sent or edited a
  // message anywhere visible. Skip if it's just the baseline being
  // established or if nothing changed.
  useEffect(() => {
    if (!activeId) return;
    if (chatVersion === null) return;
    if (lastSeenChatVersionRef.current === null) {
      lastSeenChatVersionRef.current = chatVersion;
      return;
    }
    if (lastSeenChatVersionRef.current === chatVersion) return;
    lastSeenChatVersionRef.current = chatVersion;
    // Tab visible → refetch + mark read (we'll show them immediately).
    // Tab hidden → don't fetch; the unread count will tick up via the
    // provider and the visibilitychange handler below will refetch
    // on return.
    if (
      typeof document === "undefined" ||
      document.visibilityState === "visible"
    ) {
      fetchActiveChannelMessages(activeId).then(() => {
        if (
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          markRead(activeId);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatVersion]);

  // (3) On return-to-tab, mark read for the open channel.
  useEffect(() => {
    if (!activeId) return;
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      // Re-baseline the version so the (2) effect re-runs only on
      // changes that happen AFTER return; then mark this channel as
      // read and refetch to display any messages we missed.
      lastSeenChatVersionRef.current = chatVersion;
      fetchActiveChannelMessages(activeId!).then(() => markRead(activeId!));
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, chatVersion]);

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

  function applyChannelUpdate(patch: Partial<Channel>) {
    setChannels((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, ...patch } : c)),
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
    const reply = replyTarget;
    setBody("");
    setPendingAttachments([]);
    setReplyTarget(null);
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
        replyTo: reply
          ? {
              id: reply.id,
              body: reply.body,
              authorName: reply.author.name ?? null,
            }
          : null,
      },
    ]);
    const r = await fetch(`/api/channels/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        attachments: atts,
        replyToId: reply?.id ?? null,
      }),
    });
    if (r.ok) {
      const { message } = await r.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? message : m)),
      );
    }
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditingBody(m.body);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingBody("");
  }
  async function saveEdit(m: Message) {
    if (!activeId) return;
    const next = editingBody.trim();
    if (!next) return;
    // No-op when nothing actually changed — avoids a spurious
    // "(edited)" badge from clicking Save with an unchanged body.
    if (next === m.body) {
      cancelEdit();
      return;
    }
    const optimisticEditedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id ? { ...x, body: next, editedAt: optimisticEditedAt } : x,
      ),
    );
    cancelEdit();
    const r = await fetch(`/api/channels/${activeId}/messages/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: next }),
    });
    if (!r.ok) {
      // Roll back on failure so the user can retry.
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? { ...x, body: m.body, editedAt: m.editedAt ?? null }
            : x,
        ),
      );
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not save edit");
      return;
    }
    const data = (await r.json()) as { body: string; editedAt: string | null };
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? { ...x, body: data.body, editedAt: data.editedAt }
          : x,
      ),
    );
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
      <aside
        className={cn(
          "shrink-0 border-r bg-white flex flex-col transition-[width] duration-200",
          channelsCollapsed ? "w-[72px]" : "w-72",
        )}
      >
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between gap-1">
            {!channelsCollapsed && (
              <h2 className="text-xs font-semibold uppercase text-slate-500">
                Channels
              </h2>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <NewChannelDialog
                meRole={meRole}
                students={students}
                teamMembers={teamMembers}
                onCreated={(c) => {
                  setChannels((prev) => [c, ...prev]);
                  setActiveId(c.id);
                }}
              />
              <button
                type="button"
                onClick={toggleChannelsCollapsed}
                title={channelsCollapsed ? "Expand channels" : "Collapse channels"}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                {channelsCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {!channelsCollapsed && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Find channel…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!h-8 !pl-8 !text-xs"
              />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredChannels.length === 0 ? (
            !channelsCollapsed && (
              <p className="text-xs text-slate-400 p-4 text-center">No channels yet.</p>
            )
          ) : (
            filteredChannels.map((c) => {
              const unread = unreadByChannel[c.id] ?? 0;
              const hasUnread = unread > 0;
              const isActive = activeId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  title={
                    channelsCollapsed
                      ? `${c.name}${hasUnread ? ` · ${unread} unread` : ""}`
                      : undefined
                  }
                  className={cn(
                    "w-full flex items-center rounded-lg text-left hover:bg-slate-50",
                    channelsCollapsed
                      ? "justify-center px-2 py-2"
                      : "gap-2 px-2 py-2",
                    isActive && "bg-slate-100",
                  )}
                >
                  {!channelsCollapsed && hasUnread && (
                    <span
                      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--c-pink)] px-1.5 text-[10px] font-bold text-white"
                      title={`${unread} unread message${unread === 1 ? "" : "s"}`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  <span
                    className="relative flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                    style={{ background: `${c.color}1f`, color: c.color }}
                  >
                    {iconFor(c.kind)}
                    {channelsCollapsed && hasUnread && (
                      <span
                        className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--c-pink)]"
                      />
                    )}
                  </span>
                  {!channelsCollapsed && (
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
                  )}
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
                      onSelect={() => setEditOpen(true)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 outline-none"
                    >
                      <Pencil className="h-4 w-4 text-slate-500" />
                      Edit channel
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => setSoundOpen(true)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 outline-none"
                    >
                      <Bell className="h-4 w-4 text-slate-500" />
                      Notification sound…
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

            <div
              ref={scrollRef}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragOver) setDragOver(true);
              }}
              onDragLeave={(e) => {
                if (e.target === e.currentTarget) setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length)
                  uploadFiles(e.dataTransfer.files);
              }}
              className={cn(
                "relative flex-1 overflow-y-auto p-6 space-y-2",
                dragOver && "ring-2 ring-inset ring-[var(--c-violet)] bg-violet-50/40",
              )}
            >
              {dragOver && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm font-semibold text-[var(--c-violet)]">
                  Drop files to attach
                </div>
              )}
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
                    <div key={m.id}>
                    <div
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
                      {/* Flex column so each child (quoted-reply box,
                          bubble, attachments) sizes to its OWN content
                          and is independently aligned. Previously this
                          was a block with max-w-[70%], which made the
                          quote and the bubble share the same width and
                          made the reply bubble look constrained to the
                          width of whatever it was quoting. */}
                      <div
                        className={cn(
                          "flex max-w-[70%] flex-col gap-1",
                          mine ? "items-end" : "items-start",
                        )}
                      >
                        {!sameAuthor && (
                          <div className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {mine ? "You" : m.author.name}
                            </span>{" "}
                            · {format(new Date(m.createdAt), "HH:mm")}
                            {m.editedAt && (
                              <span
                                className="ml-1 italic text-slate-400"
                                title={`Edited ${format(
                                  new Date(m.editedAt),
                                  "MMM d · HH:mm",
                                )}`}
                              >
                                (edited)
                              </span>
                            )}
                          </div>
                        )}
                        {m.replyTo && (
                          <div className="max-w-full overflow-hidden rounded-lg border-l-2 border-slate-300 bg-slate-100/70 px-2 py-1 text-left text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-600">
                              {m.replyTo.authorName ?? "Someone"}
                            </span>
                            <span className="ml-1 line-clamp-2">
                              {m.replyTo.body || "(attachment)"}
                            </span>
                          </div>
                        )}
                        {editingId === m.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveEdit(m);
                            }}
                            className="w-full max-w-full space-y-1"
                          >
                            <Textarea
                              autoFocus
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                } else if (
                                  e.key === "Enter" &&
                                  !e.shiftKey
                                ) {
                                  e.preventDefault();
                                  saveEdit(m);
                                }
                              }}
                              rows={Math.min(
                                6,
                                Math.max(2, editingBody.split("\n").length),
                              )}
                              className="!text-sm"
                              placeholder="Edit message…"
                            />
                            <div
                              className={cn(
                                "flex items-center gap-2 text-[10px] text-slate-400",
                                mine ? "justify-end" : "justify-start",
                              )}
                            >
                              <span>Enter to save · Esc to cancel</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={cancelEdit}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={
                                  !editingBody.trim() ||
                                  editingBody.trim() === m.body
                                }
                              >
                                Save
                              </Button>
                            </div>
                          </form>
                        ) : (
                          m.body && (
                            <div
                              className={cn(
                                "max-w-full rounded-2xl px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words",
                                mine
                                  ? "bg-[var(--c-violet)] text-white rounded-tr-sm"
                                  : "bg-white text-slate-800 rounded-tl-sm border",
                              )}
                            >
                              {m.body}
                              {m.editedAt && sameAuthor && (
                                <span
                                  className={cn(
                                    "ml-1.5 align-baseline text-[10px] italic",
                                    mine ? "text-violet-200" : "text-slate-400",
                                  )}
                                  title={`Edited ${format(
                                    new Date(m.editedAt),
                                    "MMM d · HH:mm",
                                  )}`}
                                >
                                  (edited)
                                </span>
                              )}
                            </div>
                          )
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
                        {mine &&
                          (() => {
                            const st = tickState(m.createdAt);
                            const blue = st === "seen";
                            const Icon = st === "sent" ? Check : CheckCheck;
                            return (
                              <div
                                className="mt-0.5 flex justify-end"
                                title={
                                  st === "seen"
                                    ? "Seen"
                                    : st === "delivered"
                                      ? "Delivered"
                                      : "Sent"
                                }
                              >
                                <Icon
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    blue
                                      ? "text-[var(--c-blue)]"
                                      : "text-slate-400",
                                  )}
                                />
                              </div>
                            );
                          })()}
                        {m.id.startsWith("temp-") || editingId === m.id ? null : (
                          <div
                            className={cn(
                              "mt-0.5 flex items-center gap-2 text-[10px]",
                              mine && "flex-row-reverse",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setReplyTarget(m)}
                              className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700"
                              title="Reply to this message"
                            >
                              <Reply className="h-3 w-3" /> Reply
                            </button>
                            {mine && (
                              <button
                                type="button"
                                onClick={() => startEdit(m)}
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700"
                                title="Edit this message"
                              >
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={send} className="border-t bg-white p-3 space-y-2">
              {replyTarget && (
                <div className="flex items-center gap-2 rounded-lg border-l-2 border-[var(--c-violet)] bg-violet-50 px-2 py-1.5 text-xs">
                  <Reply className="h-3.5 w-3.5 shrink-0 text-[var(--c-violet)]" />
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    Replying to{" "}
                    <b>
                      {replyTarget.author.id === meId
                        ? "yourself"
                        : replyTarget.author.name}
                    </b>
                    : {replyTarget.body || "(attachment)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    title="Cancel reply"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
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
                  onPaste={(e) => {
                    const files = Array.from(
                      e.clipboardData?.files ?? [],
                    );
                    if (files.length > 0) {
                      e.preventDefault();
                      uploadFiles(files);
                    }
                  }}
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

      {active && (
        <EditChannelDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          channel={active}
          teamMembers={teamMembers}
          onSaved={(patch) => applyChannelUpdate(patch)}
        />
      )}
      <SoundSettingsDialog open={soundOpen} onOpenChange={setSoundOpen} />
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
  meRole,
  students,
  teamMembers,
  onCreated,
}: {
  meRole: string;
  students: { id: string; fullName: string; alias: string | null; color: string }[];
  teamMembers: Member[];
  onCreated: (c: Channel) => void;
}) {
  const isStudent = meRole === "student";
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState(isStudent ? "direct" : "cosupervisors");
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
          {isStudent ? (
            // Students may only message their own supervisors; the server
            // forces the channel onto their own record.
            <input type="hidden" name="kind" value="direct" />
          ) : (
            <>
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
            </>
          )}
          <Field label={isStudent ? "Your supervisors" : "Members"}>
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

function EditChannelDialog({
  open,
  onOpenChange,
  channel,
  teamMembers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  channel: Channel;
  teamMembers: Member[];
  onSaved: (patch: Partial<Channel>) => void;
}) {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [color, setColor] = useState(channel.color);
  const [memberIds, setMemberIds] = useState<string[]>(
    channel.members.map((m) => m.id),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync when switching channels while the dialog is mounted.
  useEffect(() => {
    setName(channel.name);
    setDescription(channel.description ?? "");
    setColor(channel.color);
    setMemberIds(channel.members.map((m) => m.id));
    setErr(null);
  }, [channel.id, channel.name, channel.description, channel.color, channel.members]);

  // Union of pickable team members and the channel's current members
  // (so existing members stay visible even if not in the team list).
  const options: Member[] = [...teamMembers];
  for (const m of channel.members)
    if (!options.some((o) => o.id === m.id))
      options.push({ ...m, role: "member" });

  const origIds = new Set(channel.members.map((m) => m.id));
  const membersChanged =
    memberIds.length !== origIds.size ||
    memberIds.some((id) => !origIds.has(id));

  async function save() {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    if (
      membersChanged &&
      !window.confirm(
        "You're changing who is in this channel. Members you remove will lose access to it (and its history); members you add will see all past messages. Continue?",
      )
    )
      return;
    setSaving(true);
    setErr(null);
    const r = await fetch(`/api/channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        color,
        ...(membersChanged ? { memberIds } : {}),
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "Could not save changes.");
      return;
    }
    onSaved({
      name: name.trim(),
      description: description.trim() || null,
      color,
      members: options
        .filter((o) => memberIds.includes(o.id))
        .map((o) => ({
          id: o.id,
          name: o.name,
          image: o.image,
          color: o.color,
        })),
      memberCount: memberIds.length,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Channel name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description (optional)">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded border"
            />
          </Field>
          <Field label="Members">
            <div className="rounded-lg border max-h-44 overflow-y-auto p-2 space-y-1 bg-white">
              {options.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(m.id)}
                    onChange={(e) =>
                      setMemberIds((prev) =>
                        e.target.checked
                          ? [...prev, m.id]
                          : prev.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <Avatar name={m.name} src={m.image} color={m.color} size="xs" />
                  <span className="flex-1 truncate">{m.name}</span>
                  <Badge color={m.color}>{m.role}</Badge>
                </label>
              ))}
            </div>
            {membersChanged && (
              <p className="mt-1 text-[11px] text-[var(--c-red)]">
                Member changes take effect after you confirm on save.
              </p>
            )}
          </Field>
          {err && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
              {err}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SoundSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const [type, setType] = useState<SoundType>("chime");
  const [vol, setVol] = useState(0.15);

  useEffect(() => {
    if (open) {
      setType(getSoundType());
      setVol(getVolume());
    }
  }, [open]);

  function persist(nextType: SoundType, nextVol: number) {
    setType(nextType);
    setVol(nextVol);
    try {
      window.localStorage.setItem(SOUND_KEY, nextType);
      window.localStorage.setItem(VOL_KEY, String(nextVol));
      // Clear the legacy mute flag so it doesn't override the new setting.
      window.localStorage.removeItem("phdapp.muteChat");
    } catch {
      // ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-sm">
        <DialogHeader>
          <DialogTitle>Notification sound</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Sound">
            <Select
              value={type}
              onChange={(e) =>
                persist(e.target.value as SoundType, vol)
              }
            >
              <option value="chime">Chime</option>
              <option value="ding">Ding</option>
              <option value="pop">Pop</option>
              <option value="none">None (silent)</option>
            </Select>
          </Field>
          <Field label={`Volume — ${Math.round(vol * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              onChange={(e) => persist(type, parseFloat(e.target.value))}
              className="w-full"
              disabled={type === "none"}
            />
          </Field>
          <div className="flex justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => playChatSound({ type, vol })}
              disabled={type === "none"}
            >
              <Volume2 className="h-4 w-4" /> Test
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">
            Saved on this device/browser. Plays when a new chat message
            arrives while PhDapp is open.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// keep relativeTime referenced (used by tooltips/inspectors)
void relativeTime;
