import { AlertTriangle } from 'lucide-react';

interface Props {
  warning: string;
}

export function DataQualityWarning({ warning }: Props) {
  if (!warning) return null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-start gap-2.5">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm leading-snug">
        <span className="font-medium text-amber-700 dark:text-amber-300">Data quality:</span>{' '}
        <span className="text-amber-700/90 dark:text-amber-300/90">{warning}</span>
      </div>
    </div>
  );
}
