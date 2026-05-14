import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  hint?: string;
  trend?: { value: number; label: string };
}

export function StatCard({ label, value, icon: Icon, color, hint, trend }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border p-5 shadow-sm">
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${color}1a`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-slate-900">{value}</span>
        {trend && (
          <span
            className={cn(
              "text-xs font-semibold",
              trend.value >= 0 ? "text-[var(--c-green)]" : "text-[var(--c-red)]",
            )}
          >
            {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
