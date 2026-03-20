import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-5 p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Monra
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Page not found
            </h1>
            <p className="text-sm text-muted-foreground">
              The route does not exist or is unavailable in this build.
            </p>
          </div>
          <Button asChild>
            <Link to="/">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default NotFoundPage;
