"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface StudentOpt {
  id: string;
  fullName: string;
  alias: string | null;
}

const TEAM_ROLES = [
  { id: "supervisor", label: "Supervisor", color: "#6f4cff" },
  { id: "team_advisor", label: "Team advisor", color: "#0ea5e9" },
  { id: "external_advisor", label: "External advisor", color: "#00d1c1" },
  { id: "committee", label: "Committee member", color: "#a855f7" },
];

export function AddTeamMember({ students }: { students: StudentOpt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamRole, setTeamRole] = useState("supervisor");
  const [studentId, setStudentId] = useState<string>("");
  const [color, setColor] = useState("#6f4cff");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const needsStudent =
    teamRole === "external_advisor" ||
    teamRole === "committee" ||
    teamRole === "team_advisor";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    if (needsStudent && !studentId) {
      setSubmitting(false);
      setMsg({
        type: "err",
        text: "Pick a student — team advisors, external advisors and committee members are tied to specific students.",
      });
      return;
    }
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        teamRole,
        color,
        studentId: studentId || undefined,
      }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Could not add" });
      return;
    }
    const j = await r.json();
    const stmsg = j.linkedStudentId
      ? ` and linked to ${students.find((s) => s.id === j.linkedStudentId)?.fullName ?? "the student"}`
      : "";
    setMsg({
      type: "ok",
      text: `${j.userCreated ? "Created" : "Re-used existing user"} ${j.user.email}${stmsg}.`,
    });
    setName("");
    setEmail("");
    setStudentId("");
    setTeamRole("supervisor");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[var(--c-violet)]" /> Add team member
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          Create a User record directly without requiring them to sign in first.
          Handy for external advisors and committee members. They can later sign
          in with Google using the same email to access PhDapp themselves.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Alice Cooper"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="alice@example.com"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Type">
              <Select
                value={teamRole}
                onChange={(e) => setTeamRole(e.target.value)}
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={
                needsStudent
                  ? "Attach to student (required)"
                  : "Attach to student (optional)"
              }
            >
              <Select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">— none —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.alias?.trim() || s.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Accent color">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-full rounded-lg border bg-white"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
            <Badge color={TEAM_ROLES.find((r) => r.id === teamRole)!.color}>
              {TEAM_ROLES.find((r) => r.id === teamRole)!.label}
            </Badge>
            {teamRole === "supervisor" && (
              <span>
                Global role: supervisor. Can edit/manage students they are linked to.
              </span>
            )}
            {teamRole === "team_advisor" && (
              <span>
                Read-only <em>team advisor</em> for the chosen student — sees
                everything (incl. private notes &amp; wellbeing) but can only
                send suggestions to the supervisors. Add the same person to
                other students too; the same user can be a supervisor of one
                and a team advisor of another.
              </span>
            )}
            {teamRole === "external_advisor" && (
              <span>
                Will be attached to the chosen student as <em>external advisor</em>.
              </span>
            )}
            {teamRole === "committee" && (
              <span>
                Will be attached to the chosen student as <em>committee member</em>.
              </span>
            )}
          </div>

          {msg && (
            <div
              className={
                msg.type === "ok"
                  ? "text-sm text-[var(--c-green)] bg-green-50 rounded-lg p-3 flex items-start gap-2"
                  : "text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3"
              }
            >
              {msg.type === "ok" && <Check className="h-4 w-4 mt-0.5" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="brand" disabled={submitting}>
              <UserPlus className="h-4 w-4" />
              {submitting ? "Adding…" : "Add team member"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
