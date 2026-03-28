import { Link } from "@tanstack/react-router";
import { useSignOut, useSolanaAddress } from "@coinbase/cdp-hooks";
import { Check, Copy, Menu, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { sidebarItems } from "@/dashboard-view-models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSession } from "@/features/session/use-session";
import { logRuntimeError } from "@/lib/log-runtime-error";
import { cn } from "@/lib/utils";

interface AppShellProps {
  alerts?: ReactNode;
  children: ReactNode;
  notice?: ReactNode;
}

function AppShell({ alerts, children, notice }: AppShellProps) {
  const { user } = useSession();
  const { solanaAddress } = useSolanaAddress();
  const { signOut } = useSignOut();
  const [isCopied, setIsCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const userFullName = typeof user.fullName === "string" ? user.fullName.trim() : "";
  const welcomeLabel = userFullName ? `Welcome ${userFullName}` : "Welcome";

  const formattedAddress = useMemo(() => {
    if (!solanaAddress) return "Wallet pending";
    return `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}`;
  }, [solanaAddress]);

  const copyAddress = useCallback(async () => {
    if (!solanaAddress) return;

    try {
      await navigator.clipboard.writeText(solanaAddress);
      setIsCopied(true);
      setClipboardError(null);
    } catch (error) {
      logRuntimeError("Unable to copy wallet address.", error);
      setClipboardError("Unable to copy the wallet address. Copy it manually for now.");
    }
  }, [solanaAddress]);

  useEffect(() => {
    if (!isCopied) return;
    const timeout = setTimeout(() => setIsCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [isCopied]);

  useEffect(() => {
    if (!solanaAddress) {
      setClipboardError(null);
    }
  }, [solanaAddress]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[92rem] gap-6 px-4 py-4 sm:px-6 sm:py-6">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-72 shrink-0 overflow-hidden rounded-[32px] border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_28px_70px_-40px_rgba(18,18,18,0.55)] md:flex">
          <SidebarContent />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-4 z-30 rounded-[28px] border border-border bg-background/88 backdrop-blur-xl shadow-[0_18px_50px_-36px_rgba(18,18,18,0.28)]">
            <div className="flex h-20 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="icon" variant="outline" className="md:hidden">
                    <Menu />
                    <span className="sr-only">Open navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(88vw,20rem)]">
                  <SheetHeader>
                    <SheetTitle>{welcomeLabel}</SheetTitle>
                  </SheetHeader>
                  <SidebarContent compact />
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{welcomeLabel}</p>
              </div>

              <div className="hidden items-center gap-2 sm:flex">
                <Badge variant="secondary" className="hidden lg:inline-flex">
                  Solana Mainnet
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 font-mono text-xs sm:text-sm"
                  onClick={copyAddress}
                  disabled={!solanaAddress}
                >
                  {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {formattedAddress}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <Link to="/profile" preload="intent">
                    <UserRound className="size-4" />
                    Profile
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="flex w-full flex-col py-4 sm:py-5">
              {clipboardError ? (
                <div className="mb-5">
                  <InlineNotice variant="warning" title="Copy unavailable">
                    {clipboardError}
                  </InlineNotice>
                </div>
              ) : null}

              {notice ? <div className="mb-5">{notice}</div> : null}

              <div className="mb-4 flex items-center justify-between gap-3 sm:hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary">Solana Mainnet</Badge>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {formattedAddress}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
                    Sign out
                  </Button>
                  <Button variant="secondary" size="sm" asChild className="gap-2">
                    <Link to="/profile" preload="intent">
                      <UserRound className="size-4" />
                      Profile
                    </Link>
                  </Button>
                </div>
              </div>

              {alerts ? <div className="mb-5 flex flex-col gap-3 lg:flex-row">{alerts}</div> : null}

              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ compact = false }: { compact?: boolean }) {
  return (
    <ScrollArea className="flex-1">
      <div className={cn("flex min-h-full flex-col gap-6 p-6", compact && "pt-2")}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Treasury Ops</h1>
            </div>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="space-y-2">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isDisabled = item.href === undefined;

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  preload="intent"
                  className="flex w-full items-start gap-3 rounded-3xl border px-4 py-3 text-left transition-colors"
                  activeProps={{
                    className:
                      "border-sidebar-foreground/15 bg-sidebar-accent text-sidebar-foreground",
                  }}
                  inactiveProps={{
                    className:
                      "border-transparent text-sidebar-foreground/65 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl",
                          isActive
                            ? "bg-sidebar-foreground/10"
                            : "bg-sidebar-accent/80",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="block text-xs text-inherit/70">{item.caption}</span>
                      </span>
                    </>
                  )}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                disabled={isDisabled}
                className={cn(
                  "flex w-full items-start gap-3 rounded-3xl border px-4 py-3 text-left transition-colors",
                  "border-transparent text-sidebar-foreground/65 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  isDisabled && "cursor-default opacity-80 hover:border-transparent hover:bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl",
                    isDisabled ? "bg-sidebar-accent/40" : "bg-sidebar-accent/80",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-inherit/70">{item.caption}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </ScrollArea>
  );
}

function AlertBarItem({
  body,
  label,
  title,
  action,
  onClick,
}: {
  body: string;
  label: string;
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[26px] border border-border bg-card px-4 py-3 shadow-[0_14px_34px_-30px_rgba(18,18,18,0.22)]">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

export { AlertBarItem };
export default AppShell;
