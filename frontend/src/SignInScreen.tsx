import { ArrowUpRight, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Suspense, lazy } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const LazyCoinbaseAuthButton = lazy(() => import("@/features/session/CoinbaseAuthButton"));

interface Props {
  error?: string;
}

function SignInScreen({ error }: Props) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(95,135,23,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(95,135,23,0.08),transparent_26%)]" />

      <div className="relative z-10 grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-primary/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(245,242,236,0.94))]">
          <CardContent className="flex h-full flex-col justify-between gap-8 p-8 sm:p-10">
            <div className="space-y-5">
              <Badge>Monra</Badge>
              <div className="space-y-4">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  A sharper embedded wallet experience for the hackathon build.
                </h1>
                <p className="max-w-lg text-base text-muted-foreground sm:text-lg">
                  Sign in with your Coinbase embedded wallet, then land in a polished treasury dashboard aligned to the sketch you shared.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FeaturePill
                icon={Wallet}
                title="Embedded wallet"
                description="Coinbase auth stays intact."
              />
              <FeaturePill
                icon={ShieldCheck}
                title="Account state"
                description="Profile and onboarding remain live."
              />
              <FeaturePill
                icon={Sparkles}
                title="Shadcn shell"
                description="Refined fintech visual system."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/95">
          <CardContent className="flex h-full flex-col justify-center gap-6 p-8 sm:p-10">
            <div className="space-y-3">
              <Badge variant="secondary">Secure access</Badge>
              <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
              <p className="text-base text-muted-foreground">
                Use your wallet-backed sign-in to continue to the dashboard.
              </p>
            </div>

            {error && (
              <div className="rounded-[calc(var(--radius)+2px)] border border-[color:rgba(217,72,95,0.22)] bg-[color:rgba(217,72,95,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="rounded-[calc(var(--radius)+4px)] border border-border/80 bg-secondary/35 p-5">
              <Suspense
                fallback={
                  <div className="flex min-h-11 items-center justify-center rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/70 px-4 text-sm text-muted-foreground">
                    Loading wallet sign-in...
                  </div>
                }
              >
                <LazyCoinbaseAuthButton />
              </Suspense>
            </div>

            <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
              The next screen will either complete onboarding or open the redesigned dashboard, depending on account state.
            </div>
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              href="https://portal.cdp.coinbase.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage your CDP project
              <ArrowUpRight className="size-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function FeaturePill({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Wallet;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-white/70 p-4 backdrop-blur-sm">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default SignInScreen;
