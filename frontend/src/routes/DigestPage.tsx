import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityHero, type OpportunityHeroData } from '@/components/digest/OpportunityHero';
import { RankingTable } from '@/components/digest/RankingTable';
import { ReadinessAlert } from '@/components/digest/ReadinessAlert';
import { SignalSparkline } from '@/components/digest/SignalSparkline';
import { ThemeListForGroup } from '@/components/digest/ThemeListForGroup';
import { TopSignalsForGroup } from '@/components/digest/TopSignalsForGroup';
import { SourceMixChart } from '@/components/digest/SourceMixChart';
import { GroupRiceTrend } from '@/components/digest/GroupRiceTrend';
import { DigestIntro } from '@/components/digest/DigestIntro';
import { DigestHeadline } from '@/components/digest/DigestHeadline';
import { api } from '@/lib/api';
import { parseDigestRow, rowSource, type ParsedDigest } from '@/lib/parsers';
import { useActiveGroup, useActiveSource, useActiveWeek } from '@/lib/url-state';
import type { SignalRow } from '@/types';

export function DigestPage() {
  const activeGroup = useActiveGroup();
  const activeWeek = useActiveWeek();
  const activeSource = useActiveSource();

  const digestsQuery = useQuery({
    queryKey: ['digests', 'all'],
    queryFn: () => api.digests(20),
  });

  const row = useMemo(() => {
    const rows = (digestsQuery.data?.rows ?? []).filter(
      (r) => rowSource(r['Data Source']) === activeSource,
    );
    if (rows.length === 0) return null;
    if (activeWeek) return rows.find((r) => r['Week ID'] === activeWeek) ?? rows[0];
    return rows[0];
  }, [digestsQuery.data, activeWeek, activeSource]);

  const digest = useMemo(() => (row ? parseDigestRow(row) : null), [row]);

  const signalsQuery = useQuery({
    queryKey: ['signals', activeGroup, digest?.weekId],
    queryFn: () =>
      activeGroup === 'all'
        ? api.signalsForWeek(digest!.weekId)
        : api.signalsForGroup(digest!.weekId, activeGroup),
    enabled: !!digest?.weekId,
  });

  if (digestsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[120px]" />
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (!digest) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No <strong>{activeSource === 'sample' ? 'Sample' : 'Live'}</strong> runs yet.{' '}
            {activeSource === 'sample'
              ? 'Switch to Live data, or run the pipeline with USE_MOCK=true.'
              : 'Switch to Sample data, or run the pipeline.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const signals = (signalsQuery.data?.rows ?? []).filter(
    (r) => rowSource(r['Data Source']) === activeSource,
  );

  return (
    <div className="space-y-4">
      <DigestIntro
        signalCount={signals.length}
        groupCount={digest.themeBreakdown.length}
        source={digest.dataSource}
        pulledAt={digest.createdAt}
        dataQualityWarning={digest.dataQualityWarning}
      />
      {activeGroup === 'all' ? (
        <AllGroupsView digest={digest} signals={signals} />
      ) : (
        <SingleGroupView digest={digest} groupId={activeGroup} signals={signals} />
      )}
    </div>
  );
}

// ─── All Groups view ─────────────────────────────────────────────────────────

function AllGroupsView({ digest, signals }: { digest: ParsedDigest; signals: SignalRow[] }) {
  // Lead with the theme that can actually carry a decision, not the biggest one.
  // Score measures size; readiness measures whether you can defend acting. When
  // they disagree, evidence wins — that is the whole argument of this page.
  const ranked = digest.themeBreakdown.slice().sort((a, b) => b.system_rice - a.system_rice);
  const lead = ranked.find((t) => t.readiness === 'READY') ?? ranked[0];

  const heroData: OpportunityHeroData = {
    groupId: 'all',
    topTheme: lead?.headline || lead?.theme_label || digest.topTheme,
    summary: digest.readiness?.readiness_summary ?? '',
    severity: lead?.impact ?? digest.avgSeverity,
    trend: digest.trend,
    weekId: digest.weekId,
    delta: digest.wow.find((w) => w.id === digest.topGroupId) ?? null,
    consequence: lead?.consequence,
    consequenceCount: lead?.consequence_count,
    signalCount: lead?.signal_count,
    nextStep: lead?.recommended_next_steps?.[0] ?? null,
    readiness: lead?.readiness ?? null,
    score: lead?.system_rice,
    topScore: ranked[0]?.system_rice,
    evidence: lead?.evidence,
    mechanism: lead?.mechanism,
    firstMove: lead?.first_move,
    options: lead?.options,
    optionsLeftover: lead?.options_leftover,
    themeId: lead?.theme_id,
    featureGroupId: lead?.feature_group_id,
    gaps: lead?.gap_reasons,
    nextSteps: lead?.recommended_next_steps,
    rank: lead ? ranked.indexOf(lead) + 1 : undefined,
    totalThemes: ranked.length,
  };

  const readyCount = ranked.filter((t) => t.readiness === 'READY').length;

  return (
    <div className="space-y-6">
      <DigestHeadline digest={digest} collectedCount={signals.length || digest.signalCount} />

      {/* A heading, not another card. The page has one recommendation and a list
          of things to watch, and the reader should be able to tell which is which
          before reading either. */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1 border-t pt-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h2 className="text-base font-semibold tracking-tight">Do this one</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {readyCount} of {ranked.length} problems{' '}
            {readyCount === 1 ? 'has' : 'have'} enough behind {readyCount === 1 ? 'it' : 'them'} to act on
          </p>
        </div>
        <OpportunityHero data={heroData} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 border-t pt-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h2 className="text-base font-semibold tracking-tight">Keep an eye on these</h2>
          {/* Only claim something is bigger when something actually is. When the
              recommended problem is also the top-scoring one, score and evidence
              agree this week and there is no tension to explain. */}
          <p className="text-[12.5px] text-muted-foreground">
            {heroData.rank && heroData.rank > 1
              ? 'Some are bigger than the one above. Size does not beat proof.'
              : 'Ranked by size. None of these has enough behind it to act on yet.'}
          </p>
        </div>
        <ReadinessAlert themes={digest.themeBreakdown} />
        <RankingTable digest={digest} />
      </section>

      {/* Two views of the same week's intake: when it arrived, and which store
          it came from. The source split belongs here rather than only on a
          group page — "is App Store returning anything" is a question about the
          run, not about one feature. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SignalSparkline signals={signals} groupId="all" />
        <SourceMixChart signals={signals} />
      </div>
    </div>
  );
}

// ─── Single Group view ───────────────────────────────────────────────────────

function SingleGroupView({
  digest,
  groupId,
  signals,
}: {
  digest: ParsedDigest;
  groupId: string;
  signals: SignalRow[];
}) {
  const groupThemes = digest.themeBreakdown.filter((t) => t.feature_group_id === groupId);
  const topTheme = [...groupThemes].sort((a, b) => b.system_rice - a.system_rice)[0];
  const groupTrend = digest.trends.find((t) => t.id === groupId)?.trend ?? null;
  const groupDelta = digest.wow.find((w) => w.id === groupId) ?? null;
  const isTopGroup = digest.topGroupId === groupId;

  const heroData: OpportunityHeroData = {
    groupId,
    topTheme: topTheme?.headline || topTheme?.theme_label || `No themes for this group this week.`,
    summary: isTopGroup ? digest.readiness?.readiness_summary ?? '' : '',
    severity: topTheme?.impact ?? 0,
    trend: groupTrend,
    weekId: digest.weekId,
    delta: groupDelta,
    consequence: topTheme?.consequence,
    consequenceCount: topTheme?.consequence_count,
    signalCount: topTheme?.signal_count,
    nextStep: topTheme?.recommended_next_steps?.[0] ?? null,
    readiness: topTheme?.readiness ?? null,
    evidence: topTheme?.evidence,
    mechanism: topTheme?.mechanism,
    firstMove: topTheme?.first_move,
    options: topTheme?.options,
    optionsLeftover: topTheme?.options_leftover,
    themeId: topTheme?.theme_id,
    featureGroupId: topTheme?.feature_group_id,
    gaps: topTheme?.gap_reasons,
    nextSteps: topTheme?.recommended_next_steps,
  };

  return (
    <div className="space-y-4">
      <OpportunityHero data={heroData} />
      <ReadinessAlert themes={groupThemes} />

      <ThemeListForGroup themes={groupThemes} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TopSignalsForGroup signals={signals} />
        </div>
        <SourceMixChart signals={signals} />
      </div>

      <GroupRiceTrend groupId={groupId} />

      <SignalSparkline signals={signals} groupId={groupId} />
    </div>
  );
}

