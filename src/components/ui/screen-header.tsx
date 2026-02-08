import type { ReactNode } from "react";
import { cn } from "./cn";

export default function ScreenHeader({
  title,
  subtitle,
  rightSlot,
  className
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-muted sm:text-lg">{subtitle}</p>}
      </div>
      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </header>
  );
}
