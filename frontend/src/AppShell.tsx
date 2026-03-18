import { useSignOut, useSolanaAddress } from "@coinbase/cdp-hooks";
import { Check, Copy, Menu, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { sidebarItems } from "@/dashboard-view-models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { navigateTo, usePathname } from "@/router";

interface AppShellProps {
  alerts?: ReactNode;
  children: ReactNode;
}

function AppShell({ alerts, children }: AppShellProps) {
  const { solanaAddress } = useSolanaAddress();
  const { signOut } = useSignOut();
  const [isCopied, setIsCopied] = useState(false);

  const formattedAddress = useMemo(() => {
    if (!solanaAddress) return "Wallet pending";
    return `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}`;
  }, [solanaAddress]);

  const copyAddress = useCallback(async () => {
    if (!solanaAddress) return;

    try {
      await navigator.clipboard.writeText(solanaAddress);
      setIsCopied(true);
    } catch (error) {
      console.error(error);
    }
  }, [solanaAddress]);

  useEffect(() => {
    if (!isCopied) return;
    const timeout = setTimeout(() => setIsCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [isCopied]);

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
                    <SheetTitle>Monra</SheetTitle>
                    <SheetDescription>Wallet operations and treasury overview.</SheetDescription>
                  </SheetHeader>
                  <SidebarContent compact />
                </SheetContent>
              </Sheet>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                    <Wallet className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                      Monra
                    </p>
                    <p className="truncate text-lg font-semibold">Treasury workspace</p>
                  </div>
                </div>
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
              </div>
            </div>
          </header>

          <main className="flex-1">
            <div className="flex w-full flex-col py-4 sm:py-5">
              <div className="mb-4 flex items-center justify-between gap-3 sm:hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary">Solana Mainnet</Badge>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {formattedAddress}
                  </span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
                  Sign out
                </Button>
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
  const pathname = usePathname();

  return (
    <ScrollArea className="flex-1">
      <div className={cn("flex min-h-full flex-col gap-6 p-6", compact && "pt-2")}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-sidebar-foreground/60">
                Monra
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">Treasury Ops</h1>
              <p className="text-sm text-sidebar-foreground/70">
                Wallet operations, recipients, and fiat rails.
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="space-y-2">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = item.href !== undefined && pathname === item.href;
            const isDisabled = item.href === undefined;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.href) {
                    return;
                  }

                  navigateTo(item.href);
                }}
                disabled={isDisabled}
                className={cn(
                  "flex w-full items-start gap-3 rounded-3xl border px-4 py-3 text-left transition-colors",
                  isActive
                    ? "border-sidebar-foreground/15 bg-sidebar-accent text-sidebar-foreground"
                    : "border-transparent text-sidebar-foreground/65 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  isDisabled && "cursor-default opacity-80 hover:border-transparent hover:bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl",
                    isActive
                      ? "bg-sidebar-foreground/10"
                      : isDisabled
                        ? "bg-sidebar-accent/40"
                        : "bg-sidebar-accent/80",
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
