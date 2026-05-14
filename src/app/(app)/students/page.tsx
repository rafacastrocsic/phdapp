import { displayName } from "@/lib/utils";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { NewStudentDialog } from "./new-student-dialog";

const STATUS_COLOR: Record<string, string> = {
  active: "#00ca72",
  on_leave: "#ffcc4d",
  submitted: "#a855f7",
  graduated: "#2196f3",
  withdrawn: "#94a3b8",
};

export default async function StudentsPage() {
  const session = (await auth())!;
  const role = session.user.role as Role;
  if (role === "student") {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }

  const students = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, role),
    include: {
      supervisor: true,
      coSupervisors: { include: { user: true } },
      _count: { select: { tickets: true, events: true } },
    },
    orderBy: { fullName: "asc" },
  });

  const canCreate = role === "supervisor" || role === "admin";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500 mt-1">
            {students.length} {students.length === 1 ? "person" : "people"} in your
            supervision portfolio
          </p>
        </div>
        {canCreate && <NewStudentDialog />}
      </div>

      {students.length === 0 ? (
        <div className="rounded-2xl border bg-white p-12 text-center">
          <div className="text-base font-semibold text-slate-700">
            No students yet
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {canCreate
              ? "Click the button above to add your first student."
              : "You're not linked to any students yet."}
          </p>
          {canCreate && (
            <div className="mt-4 inline-block">
              <NewStudentDialog>
                <Button variant="brand">
                  <Plus className="h-4 w-4" /> Add a student
                </Button>
              </NewStudentDialog>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {students.map((s) => (
            <Link
              key={s.id}
              href={`/students/${s.id}`}
              className="group relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: s.color }}
              />
              <div className="flex items-start gap-3">
                <Avatar
                  name={displayName(s)}
                  src={s.avatarUrl}
                  color={s.color}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-slate-900 truncate">
                    {displayName(s)}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {s.email}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge color={STATUS_COLOR[s.status] ?? "#94a3b8"}>
                      {s.status}
                    </Badge>
                    <Badge color="#6366f1">Year {s.programYear}</Badge>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
              </div>

              {s.thesisTitle && (
                <p className="mt-4 text-sm text-slate-600 line-clamp-2 italic">
                  &ldquo;{s.thesisTitle}&rdquo;
                </p>
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <span>
                    <strong className="text-slate-900">{s._count.tickets}</strong> tickets
                  </span>
                  <span>
                    <strong className="text-slate-900">{s._count.events}</strong> events
                  </span>
                </div>
                {s.expectedEndDate && (
                  <span className="text-slate-400">
                    ends {format(s.expectedEndDate, "MMM yyyy")}
                  </span>
                )}
              </div>

              {s.coSupervisors.length > 0 && (
                <div className="mt-4 flex items-center gap-2 pt-4 border-t">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">
                    Also supervised by
                  </span>
                  <div className="flex -space-x-1.5">
                    {s.coSupervisors.slice(0, 3).map((cs) => (
                      <Avatar
                        key={cs.id}
                        name={cs.user.name}
                        src={cs.user.image}
                        color={cs.user.color}
                        size="xs"
                      />
                    ))}
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
