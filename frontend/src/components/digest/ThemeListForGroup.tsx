import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TREND_CLASS } from '@/lib/colors';
import { ConsequenceBadge, MoscowBadge, ReadinessBadge } from '@/components/common/StatusBadges';
import { ThemeScoreDerivation } from './ThemeScoreDerivation';
import { WhatPeopleReported } from './WhatPeopleReported';
import { WhatWeThink } from './WhatWeThink';
import { WhatWeDontKnow } from './WhatWeDontKnow';
import { TREND_LABEL } from '@/lib/vocabulary';
import { useScopedLinkBuilder } from '@/lib/url-state';
import type { ThemeBreakdownEntry } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
}

export function ThemeListForGroup({ themes }: Props) {
  const buildLink = useScopedLinkBuilder();
  const sorted = [...themes].sort((a, b) => b.system_rice - a.system_rice);
  // Every score is described against the strongest one in the run, because on its own
  // the number has no scale — it is a ranking position, not a mark out of a hundred.
  const topScore = sorted[0]?.system_rice ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">Themes in this group</CardTitle>
          <CardDescription>
            Highest priority first. Open the full report to change effort and re-rank.
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="-mr-2 shrink-0">
          <Link to={buildLink('/report')}>
            Full report
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No theme breakdown yet for this group.
            <br />
            <span className="text-xs">
              The Theme Breakdown JSON column on the Weekly Digests sheet is empty for this week.
              Redeploy the backend and run the pipeline once to populate it.
            </span>
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((t) => (
              <div key={t.theme_id} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  {/* The finding when we have one; the category label only as a fallback. */}
                  <p className="text-[15px] font-semibold leading-snug flex-1">
                    {t.headline || t.theme_label}
                  </p>
                  <span className="font-mono tabular-nums text-base font-semibold shrink-0">
                    {t.system_rice.toFixed(1)}
                  </span>
                </div>
                {/* The plain sentence leads. Someone who does not know what RICE is
                    should still learn what this theme is and how bad it is getting. */}
                <p className="text-[13.5px] text-muted-foreground mb-2 leading-relaxed">
                  {t.signal_count === 1 ? '1 person raised this' : `${t.signal_count} people raised this`}
                  {', '}
                  <span className={TREND_CLASS[t.trend_direction]}>{TREND_LABEL[t.trend_direction]}</span>.
                </p>
                {/* The trend is already in the sentence above; repeating it as a chip
                    was the same fact three times on one card. */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Cost first: it is the one badge here that says what the
                      problem actually did to someone. */}
                  <ConsequenceBadge
                    value={t.consequence}
                    count={t.consequence_count}
                    total={t.signal_count}
                  />
                  <MoscowBadge value={t.moscow} />
                  <ReadinessBadge value={t.readiness} />
                </div>
                <WhatPeopleReported evidence={t.evidence} signalCount={t.signal_count} />
                <WhatWeThink mechanism={t.mechanism} />
                <WhatWeDontKnow gaps={t.gap_reasons} nextSteps={t.recommended_next_steps} />
                <ThemeScoreDerivation theme={t} topScore={topScore} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
