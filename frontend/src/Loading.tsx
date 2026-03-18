import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  label?: string;
}

function Loading({ label = "Loading" }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Card className="w-full max-w-xl border-primary/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(245,242,236,0.94))]">
        <CardContent className="space-y-6 p-8 sm:p-10">
          <Badge>Monra</Badge>
          <div className="space-y-3">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-10 w-3/4 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-4/5 rounded-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-[calc(var(--radius)+2px)]" />
            <Skeleton className="h-28 rounded-[calc(var(--radius)+2px)]" />
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </main>
  );
}

export default Loading;
