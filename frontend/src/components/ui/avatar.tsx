import * as React from "react";

import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-secondary text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-semibold text-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback };
