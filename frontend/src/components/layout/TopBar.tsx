import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { RunPipelineDialog } from '@/components/run-pipeline/RunPipelineDialog';
import { api } from '@/lib/api';
import { parseDigestRow } from '@/lib/parsers';

export function TopBar() {
  const { data } = useQuery({
    queryKey: ['runs', 'latest'],
    queryFn: api.latestRun,
    retry: false,
    staleTime: 30_000,
  });

  const weekId = data ? parseDigestRow(data).weekId : null;

  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3 mr-auto">
          <span className="font-semibold tracking-tight">Amazon Discovery</span>
          {weekId && <Badge variant="secondary" className="font-mono">{weekId}</Badge>}
        </div>
        <RunPipelineDialog />
        <ThemeToggle />
      </div>
    </header>
  );
}
