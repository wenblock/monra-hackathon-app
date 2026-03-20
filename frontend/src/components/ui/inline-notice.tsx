import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface InlineNoticeProps {
  children: ReactNode;
  className?: string;
  title?: string;
  variant?: "info" | "warning" | "error";
}

const noticeVariants: Record<NonNullable<InlineNoticeProps["variant"]>, string> = {
  info: "border-primary/18 bg-primary/6 text-foreground",
  warning: "border-amber-500/20 bg-amber-500/10 text-foreground",
  error:
    "border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] text-foreground",
};

function InlineNotice({
  children,
  className,
  title,
  variant = "info",
}: InlineNoticeProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[calc(var(--radius)+2px)] border px-4 py-3 text-sm shadow-[0_10px_28px_-24px_rgba(18,18,18,0.32)]",
        noticeVariants[variant],
        className,
      )}
    >
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      <div className={cn("text-sm text-current/85", title && "mt-1")}>{children}</div>
    </div>
  );
}

export default InlineNotice;
