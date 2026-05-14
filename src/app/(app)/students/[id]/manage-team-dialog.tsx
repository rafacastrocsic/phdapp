"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, X, Mail, UserPlus, Crown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";

interface MemberUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  color: string;
  role: string;
}
interface CoSup {
  id: string;
  userId: string;
  role: string;
  user: MemberUser;
}

const ROLE_OPTIONS = [
  { id: "supervisor", label: "Supervisor" },
  { id: "external_advisor", label: "External advisor" },
  { id: "committee", label: "Committee member" },
];

export function ManageTeamDialog({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState<MemberUser | null>(null);
  const [current, setCurrent] = useState<CoSup[]>([]);
  const [candidates, setCandidates] = useState<MemberUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedUserId, setPickedUserId] = useState("");
  const [addRole, setAddRole] = useState("supervisor");
  const [emailInput, setEmailInput] = useState("");
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError(null);
    const r = await fetch(`/api/students/${studentId}/cosupervisors`);
    setLoading(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not load team");
      return;
    }
    const j = await r.json();
    setPrimary(j.primary ?? null);
    setCurrent(j.current);
    setCandidates(j.candidates);
  }

  useEffect(() => {
    if (open) load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addByPick() {
    if (!pickedUserId) return;
    await add({ userId: pickedUserId, role: addRole });
    setPickedUserId("");
  }

  async function addByEmail() {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    await add({ email, role: addRole });
    setEmailInput("");
  }

  async function add(body: object) {
    setAdding(true);
    setError(null);
    const r = await fetch(`/api/students/${studentId}/cosupervisors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not add");
      return;
    }
    await load();
    router.refresh();
  }

  async function remove(userId: string, isPrimary: boolean) {
    const msg = isPrimary
      ? "Remove the primary supervisor? Another team member will be automatically promoted to primary."
      : "Remove this person from the supervision team?";
    if (!confirm(msg)) return;
    const r = await fetch(
      `/api/students/${studentId}/cosupervisors/${userId}`,
      { method: "DELETE" },
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not remove");
      return;
    }
    await load();
    router.refresh();
  }

  async function makePrimary(userId: string) {
    if (
      !confirm(
        "Make this person the primary supervisor? The current primary will become an additional supervisor.",
      )
    )
      return;
    const r = await fetch(
      `/api/students/${studentId}/cosupervisors/${userId}`,
      { method: "PATCH" },
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not promote");
      return;
    }
    await load();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4" /> Manage team
        </Button>
      </DialogTrigger>
      <DialogContent className="!max-w-xl">
        <DialogHeader>
          <DialogTitle>Supervision team — {studentName}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3 mb-3">
            {error}
          </div>
        )}

        <div className="space-y-1.5 mb-4">
          <h4 className="text-xs font-semibold uppercase text-slate-500">
            Current members
          </h4>
          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg shimmer" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {primary && (
                <li className="flex items-center gap-3 rounded-lg border-2 border-amber-200 bg-amber-50/60 p-2">
                  <Avatar
                    name={primary.name}
                    src={primary.image}
                    color={primary.color}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                      {primary.name ?? primary.email}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {primary.email}
                    </div>
                  </div>
                  <Badge color="#f59e0b" variant="solid">Primary</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(primary.id, true)}
                    title="Remove primary supervisor (promotes another)"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              )}
              {current.map((cs) => (
                <li
                  key={cs.id}
                  className="flex items-center gap-3 rounded-lg border bg-white p-2"
                >
                  <Avatar
                    name={cs.user.name}
                    src={cs.user.image}
                    color={cs.user.color}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {cs.user.name ?? cs.user.email}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {cs.user.email}
                    </div>
                  </div>
                  <Badge color={teamRoleColor(cs.role)}>
                    {teamRoleLabel(cs.role)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => makePrimary(cs.userId)}
                    title="Promote to primary supervisor"
                  >
                    <Crown className="h-3.5 w-3.5" /> Primary
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(cs.userId, false)}
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {!primary && current.length === 0 && (
                <p className="text-xs text-slate-500 italic py-2">
                  No team members yet — add one below.
                </p>
              )}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <h4 className="text-xs font-semibold uppercase text-slate-500">
            Add a member
          </h4>

          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <label className="block">
              <span className="text-[11px] text-slate-500">From existing users</span>
              <Select
                value={pickedUserId}
                onChange={(e) => setPickedUserId(e.target.value)}
                disabled={adding || loading}
              >
                <option value="">— pick a user —</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email} ({u.role})
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">As</span>
              <Select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                disabled={adding}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              type="button"
              variant="brand"
              size="md"
              onClick={addByPick}
              disabled={!pickedUserId || adding}
            >
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>

          <div className="text-center text-xs text-slate-400">or</div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <label className="block">
              <span className="text-[11px] text-slate-500">By email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="alice@uni.edu"
                  className="!pl-9"
                  disabled={adding}
                />
              </div>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={addByEmail}
              disabled={!emailInput.trim() || adding}
            >
              <Plus className="h-4 w-4" /> Add by email
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            By-email only works for someone who has already signed in to PhDapp at least once.
          </p>
        </div>

        <div className="flex justify-end pt-3 border-t mt-3">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function teamRoleLabel(role: string): string {
  return (
    {
      supervisor: "Supervisor",
      co_supervisor: "Supervisor",
      external_advisor: "External advisor",
      committee: "Committee member",
    } as Record<string, string>
  )[role] ?? role.replace("_", " ");
}

function teamRoleColor(role: string): string {
  return (
    {
      supervisor: "#6f4cff",
      co_supervisor: "#6f4cff",
      external_advisor: "#00d1c1",
      committee: "#a855f7",
    } as Record<string, string>
  )[role] ?? "#94a3b8";
}
