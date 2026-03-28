import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { lazyWithChunkRetry } from "@/lib/lazy-with-chunk-retry";

const LazyCoinbaseAuthButton = lazyWithChunkRetry(
  () => import("@/features/session/CoinbaseAuthButton"),
  "coinbase-auth-button",
);

interface Props {
  error?: string;
}

function SignInScreen({ error }: Props) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(95,135,23,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(95,135,23,0.07),transparent_28%)]" />

      <Card className="relative z-10 w-full max-w-md border-primary/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.985),rgba(245,242,236,0.95))]">
        <CardContent className="flex flex-col items-center gap-6 p-8 text-center sm:p-10">
          <img src="/logo.svg" alt="Monra Logo" className="h-[18px] w-auto" />

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Global payments, simplified
            </h1>
            <p className="text-base text-muted-foreground sm:text-lg">
              Send and receive money instantly with stablecoins
            </p>
          </div>

          {error && (
            <div className="w-full rounded-[calc(var(--radius)+2px)] border border-[color:rgba(217,72,95,0.22)] bg-[color:rgba(217,72,95,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="w-full">
            <Suspense
              fallback={
                <div className="flex min-h-11 w-full items-center justify-center rounded-full border border-border/70 bg-background/70 px-4 text-sm text-muted-foreground">
                  Preparing secure sign-in...
                </div>
              }
            >
              <LazyCoinbaseAuthButton />
            </Suspense>
          </div>

          <p className="text-sm text-muted-foreground">Secure &bull; No passwords</p>
        </CardContent>
      </Card>
    </main>
  );
}

export default SignInScreen;
