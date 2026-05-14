import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
  variant?: "solid" | "soft" | "outline";
}

export function Badge({
  className,
  color = "#6366f1",
  variant = "soft",
  style,
  ...props
}: BadgeProps) {
  const styles: React.CSSProperties = { ...style };
  if (variant === "solid") {
    styles.background = color;
    styles.color = "white";
  } else if (variant === "soft") {
    styles.background = `${color}1f`; // 12% alpha
    styles.color = color;
  } else {
    styles.borderColor = color;
    styles.color = color;
    styles.background = "transparent";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border border-transparent",
        variant === "outline" && "border",
        className,
      )}
      style={styles}
      {...props}
    />
  );
}
