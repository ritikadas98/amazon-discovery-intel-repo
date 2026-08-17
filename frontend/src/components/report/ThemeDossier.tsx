import { ConsequenceBadge, ReadinessBadge, ScoreBandBadge } from '@/components/common/StatusBadges';
import { MetricText } from '@/components/common/MetricText';
import { WhatPeopleReported } from '@/components/digest/WhatPeopleReported';
import { WhatWeThink } from '@/components/digest/WhatWeThink';
import { WhatWeDontKnow } from '@/components/digest/WhatWeDontKnow';
import { OptionsMenu } from '@/components/digest/OptionsMenu';
import type { ThemeBreakdownEntry } from '@/types';

/**
 * One problem, in full, on the report page.
 *
 * The digest answers "what should I do this week". The report is where a PM
 * goes when they have already decided to look properly, and it previously
 * answered a narrower question than the digest did: a scores table, then every
 * theme's gaps collected into one list, then every theme's next steps collected
 * into another. Reading it meant holding a theme in your head while scrolling
 * between three places that each knew a third of the story.
 *
 * This puts one theme's whole argument together — counted, inferred, unknown,
 * and what to do — which is the same shape the decision card uses. The two
 * pages then teach the same reading habit rather than two different ones.
 */
export function ThemeDossier({ theme }: { theme: ThemeBreakdownEntry }) {
  const move = theme.first_move;

  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h3 className="max-w-[62ch] text-[17px] font-semibold leading-snug tracking-tight">
            <MetricText>{theme.headline || theme.theme_label}</MetricText>
          </h3>
          <span className="shrink-0 text-right">
            <span className="block text-2xl font-semibold leading-none tabular-nums">
              {theme.signal_count}
            </span>
            <span className="mt-1 block text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              complaints
            </span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ReadinessBadge value={theme.readiness} />
          <ConsequenceBadge
            value={theme.consequence}
            count={theme.consequence_count}
            total={theme.signal_count}
          />
          <ScoreBandBadge score={theme.system_rice} topScore={theme.system_rice} />
          {/* The label is kept beside the headline rather than replaced by it:
              the headline says what happened, the label says what it is filed
              under, and a PM searching the sheet needs the second one. */}
          {theme.headline && (
            <span className="text-[11.5px] text-muted-foreground">Filed as: {theme.theme_label}</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 lg:grid-cols-3">
        <WhatPeopleReported evidence={theme.evidence} signalCount={theme.signal_count} />
        <WhatWeThink mechanism={theme.mechanism} readiness={theme.readiness} />
        <WhatWeDontKnow gaps={theme.gap_reasons} nextSteps={theme.recommended_next_steps} />
      </div>

      {move && (
        <div className="mx-5 mb-4 rounded-md border-l-4 border-l-red-600 bg-red-50 px-4 py-3 dark:border-l-red-500 dark:bg-red-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white dark:bg-red-400 dark:text-red-950">
              <span aria-hidden>▲</span>Do this first
            </span>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              {move.owner} · {move.effort}
            </span>
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-snug">
            <MetricText>{move.action}</MetricText>
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <MetricText>{move.rationale}</MetricText>
          </p>
        </div>
      )}

      <OptionsMenu
        options={theme.options}
        leftover={theme.options_leftover}
        totalComplaints={theme.signal_count}
        gatedOn={move}
      />
    </section>
  );
}
