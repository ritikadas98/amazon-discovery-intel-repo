import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Stage {
  label: string;
  endAt: number;
}

const STAGES: Stage[] = [
  { label: 'Loading signals', endAt: 2 },
  { label: 'Cleaning with Gemini', endAt: 8 },
  { label: 'Detecting regressions', endAt: 10 },
  { label: 'Synthesizing themes', endAt: 17 },
  { label: 'Scoring + writing sheet', endAt: 23 },
  { label: 'Sending digest email', endAt: 28 },
];

const TOTAL_ESTIMATED_SECONDS = STAGES[STAGES.length - 1].endAt + 2;

interface Props {
  startedAt: number;
  done: boolean;
}

export function PipelineStepper({ startedAt, done }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [startedAt, done]);

  const currentIdx = done ? STAGES.length : STAGES.findIndex((s) => elapsed < s.endAt);
  const activeIdx = currentIdx === -1 ? STAGES.length - 1 : currentIdx;
  const percent = done ? 100 : Math.min(99, Math.round((elapsed / TOTAL_ESTIMATED_SECONDS) * 100));
  const remaining = Math.max(0, Math.ceil(TOTAL_ESTIMATED_SECONDS - elapsed));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{done ? 'Complete' : `~${remaining}s remaining`}</span>
          <span className="font-mono">{percent}%</span>
        </div>
        <Progress value={percent} />
      </div>

      <ul className="space-y-2">
        {STAGES.map((stage, idx) => {
          const isComplete = idx < activeIdx || done;
          const isActive = idx === activeIdx && !done;
          return (
            <li
              key={stage.label}
              className={cn('flex items-center gap-2.5 text-sm', isComplete || isActive ? 'text-foreground' : 'text-muted-foreground')}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isComplete
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isComplete ? <Check className="h-3 w-3" /> : isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : idx + 1}
              </span>
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
