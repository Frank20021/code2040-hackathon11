import { cn } from "./cn";

export default function Stepper({
  steps,
  activeStep
}: {
  steps: string[];
  activeStep: number;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {steps.map((step, index) => {
        const isActive = index === activeStep;
        const isDone = index < activeStep;
        return (
          <li
            key={step}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              isActive && "border-primary bg-cardStrong text-foreground",
              isDone && "border-success bg-cardStrong text-foreground",
              !isActive && !isDone && "border-border bg-card text-muted"
            )}
          >
            <span className="font-semibold">{index + 1}.</span> {step}
          </li>
        );
      })}
    </ol>
  );
}
