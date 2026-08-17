import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useScopedLinkBuilder } from '@/lib/url-state';

/**
 * What the PM decided, recorded rather than assumed.
 *
 * "Not this week" is the one that matters. Every tool records what was built;
 * almost none records what was deliberately deferred, so a question like "why
 * didn't we do returns in August" has no answer six weeks later. It writes
 * `not_now` rather than `not_useful` on purpose — a deferral is not a judgement
 * that the analysis was wrong, and filing it as one would mislead the next
 * reader.
 *
 * The write is best effort. A failed append must not block the decision or make
 * the PM repeat it, so the button settles either way and says which happened.
 */
export function DecisionActions({
  themeId,
  weekId,
  featureGroupId,
  actionLabel,
}: {
  themeId: string;
  weekId: string;
  featureGroupId: string;
  actionLabel: string;
}) {
  const [decided, setDecided] = useState<'doing' | 'not_now' | null>(null);
  const buildLink = useScopedLinkBuilder();

  async function record(rating: 'doing' | 'not_now', done: string) {
    setDecided(rating);
    const ok = await api
      .recordDecision({ theme_id: themeId, week_id: weekId, feature_group_id: featureGroupId, rating })
      .catch(() => false);
    toast[ok ? 'success' : 'warning'](
      ok ? done : 'Recorded here, but the write did not reach the sheet.',
    );
  }

  return (
    <div className="mt-3.5 flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={decided !== null}
        onClick={() => record('doing', 'Logged as doing. It will show against this week.')}
      >
        {decided === 'doing' ? 'Logged as doing' : actionLabel}
      </Button>

      <Button asChild size="sm" variant="outline" className="bg-background">
        <Link to={buildLink('/chat')}>Ask about this</Link>
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="bg-background"
        disabled={decided !== null}
        onClick={() => record('not_now', 'Logged as deferred, with the week it was deferred in.')}
      >
        {decided === 'not_now' ? 'Deferred' : 'Not this week'}
      </Button>
    </div>
  );
}
