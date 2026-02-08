import type { ReactNode } from "react";
import { cn } from "./cn";

export function Field({
  label,
  description,
  control,
  className
}: {
  label: string;
  description?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex flex-col gap-1">
        <div className="text-base font-semibold text-foreground">{label}</div>
        {description && <div className="text-sm text-muted">{description}</div>}
      </div>
      {control}
    </div>
  );
}
