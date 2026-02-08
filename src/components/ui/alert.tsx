import type { ReactNode } from "react";
import { cn } from "./cn";

const toneClass = {
  info: "border-border bg-cardStrong text-foreground",
  success: "border-success bg-cardStrong text-foreground",
  warning: "border-warning bg-cardStrong text-foreground",
  danger: "border-danger bg-cardStrong text-foreground"
};

export default function Alert({
  tone = "info",
  title,
  children,
  className
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-4 text-base", toneClass[tone], className)} role="status">
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-1 text-sm text-muted" : "text-sm text-muted"}>{children}</div>
    </div>
  );
}
