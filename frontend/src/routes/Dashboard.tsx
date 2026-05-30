import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DigestView } from '@/components/dashboard/DigestView';
import { api } from '@/lib/api';
import { parseDigestRow } from '@/lib/parsers';

function DigestSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[68px]" />
        ))}
      </div>
      <Skeleton className="h-[520px] w-full" />
      <Skeleton className="h-[320px] w-full" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['runs', 'latest'],
    queryFn: api.latestRun,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Header />
        <DigestSkeleton />
      </div>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : 'Failed to load the latest run.';
    const isMissing = message.includes('404');
    return (
      <div className="space-y-4">
        <Header />
        <EmptyState
          message={
            isMissing
              ? 'No pipeline runs yet. Click "Run pipeline" in the top bar to create the first one.'
              : message
          }
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Header />
        <EmptyState message="No data returned from /runs/latest." />
      </div>
    );
  }

  const digest = parseDigestRow(data);

  return (
    <div className="space-y-4">
      <Header weekId={digest.weekId} />
      <DigestView digest={digest} showRegressionBanner={false} />
    </div>
  );
}

function Header({ weekId }: { weekId?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {weekId ? (
          <>
            Showing the latest pipeline run — week <span className="font-mono">{weekId}</span>.
          </>
        ) : (
          'Showing the latest pipeline run.'
        )}
      </p>
    </div>
  );
}
