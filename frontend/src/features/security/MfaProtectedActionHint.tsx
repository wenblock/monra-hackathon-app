import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

interface MfaProtectedActionHintProps {
  actionLabel: string;
  className?: string;
}

function MfaProtectedActionHint({ actionLabel, className }: MfaProtectedActionHintProps) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
          <ShieldCheck className="size-4" />
        </span>
        <p className="text-sm text-muted-foreground">
          If MFA is enabled, Coinbase will ask for a verification code before {actionLabel}.
        </p>
      </div>
    </div>
  );
}

export default MfaProtectedActionHint;
