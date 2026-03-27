import { Component, type ErrorInfo, type ReactNode } from "react";

interface StartupErrorBoundaryProps {
  children: ReactNode;
}

interface StartupErrorBoundaryState {
  errorMessage: string | null;
}

class StartupErrorBoundary extends Component<
  StartupErrorBoundaryProps,
  StartupErrorBoundaryState
> {
  state: StartupErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): StartupErrorBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown startup error",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Monra startup error", error, errorInfo.componentStack);
  }

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-xl rounded-[calc(var(--radius)+6px)] border border-[color:color-mix(in_srgb,var(--danger)_20%,white)] bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(245,242,236,0.94))] p-8 text-foreground shadow-[0_24px_70px_-44px_rgba(18,18,18,0.38)] sm:p-10">
          <div className="space-y-5">
            <div className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--danger)_18%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--danger)]">
              Startup error
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight">Unable to start Monra</h1>
              <p className="text-sm text-muted-foreground">
                The application hit a browser-side startup error before the workspace could
                render. Reload the app to retry with the latest assets.
              </p>
            </div>

            <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/70 px-4 py-3">
              <p className="font-mono text-xs text-muted-foreground">{this.state.errorMessage}</p>
            </div>

            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/92"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export default StartupErrorBoundary;
