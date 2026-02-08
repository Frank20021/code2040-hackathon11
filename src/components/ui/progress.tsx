import { cn } from "./cn";

export default function Progress({
  value,
  className
}: {
  value: number;
  className?: string;
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-3 w-full overflow-hidden rounded-full bg-cardStrong", className)}>
      <div
        className="h-full bg-primary transition-[width] duration-base ease-standard"
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}
