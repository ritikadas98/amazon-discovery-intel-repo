import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DigestView } from '@/components/dashboard/DigestView';
import { SignalsTable } from '@/components/week/SignalsTable';
import { api } from '@/lib/api';
import { parseDigestRow } from '@/lib/parsers';

export function WeekDetail() {
  const { weekId } = useParams<{ weekId: string }>();

  const digestsQuery = useQuery({
    queryKey: ['digests', 100],
    queryFn: () => api.digests(100),
  });

  const signalsQuery = useQuery({
    queryKey: ['signals', weekId],
    queryFn: () => api.signalsForWeek(weekId!),
    enabled: !!weekId,
  });

  const row = digestsQuery.data?.rows.find((r) => r['Week ID'] === weekId);

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1">
          <Link to="/history">
            <ArrowLeft className="h-3.5 w-3.5" />
            All weeks
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight font-mono">{weekId}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly pipeline run — overview and signal-level drill-down.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="signals">
            Signals
            {signalsQuery.data && (
              <span className="ml-1.5 text-xs text-muted-foreground">({signalsQuery.data.count})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-2">
          {digestsQuery.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-[68px]" />
              <Skeleton className="h-[400px]" />
            </div>
          )}
          {digestsQuery.isError && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-destructive">
                  {digestsQuery.error instanceof Error
                    ? digestsQuery.error.message
                    : 'Failed to load digest.'}
                </p>
              </CardContent>
            </Card>
          )}
          {digestsQuery.data && !row && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No digest row found for week <span className="font-mono">{weekId}</span>.
                </p>
              </CardContent>
            </Card>
          )}
          {row && <DigestView digest={parseDigestRow(row)} showRegressionBanner={false} />}
        </TabsContent>

        <TabsContent value="signals" className="pt-2">
          {signalsQuery.isLoading && (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}
          {signalsQuery.isError && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-destructive">
                  {signalsQuery.error instanceof Error
                    ? signalsQuery.error.message
                    : 'Failed to load signals.'}
                </p>
              </CardContent>
            </Card>
          )}
          {signalsQuery.data && <SignalsTable rows={signalsQuery.data.rows} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
