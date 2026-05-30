import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PipelineStepper } from './PipelineStepper';
import { api } from '@/lib/api';
import { featureGroupName } from '@/lib/parsers';
import type { PipelineResult } from '@/types';

export function RunPipelineDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (recipient_email: string | undefined) => api.runPipeline(recipient_email),
    onSuccess: (result: PipelineResult) => {
      queryClient.invalidateQueries({ queryKey: ['runs', 'latest'] });
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      queryClient.invalidateQueries({ queryKey: ['signals'] });
      queryClient.invalidateQueries({ queryKey: ['effort'] });
      const groupName = featureGroupName(result.topGroup);
      toast.success('Pipeline complete', {
        description: `${result.weekId} · ${groupName} · RICE ${result.topRiceScore.toFixed(1)} · ${result.signalCount} signals${result.regressionCount > 0 ? ` · ${result.regressionCount} regression alert${result.regressionCount === 1 ? '' : 's'}` : ''}`,
      });
      window.setTimeout(() => {
        setOpen(false);
        setStartedAt(null);
      }, 1200);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Pipeline failed.';
      toast.error('Pipeline failed', { description: message });
      setStartedAt(null);
    },
  });

  const isRunning = mutation.isPending;
  const isDone = mutation.isSuccess;

  const handleStart = () => {
    setStartedAt(Date.now());
    mutation.mutate(email.trim() ? email.trim() : undefined);
  };

  const handleOpenChange = (next: boolean) => {
    if (isRunning) return;
    setOpen(next);
    if (!next) {
      mutation.reset();
      setStartedAt(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Play className="h-3.5 w-3.5" />
          Run pipeline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => isRunning && e.preventDefault()}>
        {!startedAt ? (
          <>
            <DialogHeader>
              <DialogTitle>Run pipeline now?</DialogTitle>
              <DialogDescription>
                Triggers the full pipeline: ingest signals, 3 Vertex AI calls, write to Google Sheets,
                send digest + regression emails. Takes ~30 seconds.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="recipient-email">
                Recipient email
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  (optional — uses server default if blank)
                </span>
              </label>
              <Input
                id="recipient-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStart}>
                <Play className="h-3.5 w-3.5" />
                Start pipeline
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pipeline running</DialogTitle>
              <DialogDescription>
                {isDone
                  ? 'Pipeline finished successfully.'
                  : 'Please keep this tab open until the pipeline finishes.'}
              </DialogDescription>
            </DialogHeader>
            <PipelineStepper startedAt={startedAt} done={isDone} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
