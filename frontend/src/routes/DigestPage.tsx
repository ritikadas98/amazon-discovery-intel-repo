import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityHero, type OpportunityHeroData } from '@/components/digest/OpportunityHero';
import { RankingTable } from '@/components/digest/RankingTable';
import { ReadinessAlert } from '@/components/digest/ReadinessAlert';
import { DataQualityWarning } from '@/components/digest/DataQualityWarning';
import { SignalSparkline } from '@/components/digest/SignalSparkline';
import { ThemeListForGroup } from '@/components/digest/ThemeListForGroup';
import { TopSignalsForGroup } from '@/components/digest/TopSignalsForGroup';
import { SourceMixChart } from '@/components/digest/SourceMixChart';
import { GroupRiceTrend } from '@/components/digest/GroupRiceTrend';
import { api } from '@/lib/api';
import { parseDigestRow, type ParsedDigest } from '@/lib/parsers';
import { useActiveGroup, useActiveWeek } from '@/lib/url-state';
import type { SignalRow } from '@/types';

export function DigestPage() {
  const activeGroup = useActiveGroup();
  const activeWeek = useActiveWeek();

  const digestsQuery = useQuery({
    queryKey: ['digests', 'all'],
    queryFn: () => api.digests(20),
  });

  const row = useMemo(() => {
    const rows = digestsQuery.data?.rows ?? [];
    if (rows.length === 0) return null;
    if (activeWeek) return rows.find((r) => r['Week ID'] === activeWeek) ?? rows[0];
    return rows[0];
  }, [digestsQuery.data, activeWeek]);

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
            No pipeline runs yet. Click "Run pipeline" in the top bar to create the first one.
          </p>
        </CardContent>
      </Card>
    );
  }

  const signals = signalsQuery.data?.rows ?? [];

  return activeGroup === 'all' ? (
    <AllGroupsView digest={digest} signals={signals} />
  ) : (
    <SingleGroupView digest={digest} groupId={activeGroup} signals={signals} />
  );
}

// ─── All Groups view ─────────────────────────────────────────────────────────

function AllGroupsView({ digest, signals }: { digest: ParsedDigest; signals: SignalRow[] }) {
  const heroData: OpportunityHeroData = {
    groupId: 'all',
    topTheme:
      digest.themeBreakdown.slice().sort((a, b) => b.system_rice - a.system_rice)[0]?.theme_label ||
      digest.topTheme,
    summary: digest.readiness?.readiness_summary ?? '',
    severity: digest.avgSeverity,
    trend: digest.trend,
    weekId: digest.weekId,
    delta: digest.wow.find((w) => w.id === digest.topGroupId) ?? null,
  };

  return (
    <div className="space-y-4">
      <OpportunityHero data={heroData} />
      {digest.dataQualityWarning && <DataQualityWarning warning={digest.dataQualityWarning} />}
      {(digest.readiness?.themes ?? []).length > 0 && (
        <ReadinessAlert themes={digest.readiness!.themes} />
      )}
      <RankingTable digest={digest} />
      <SignalSparkline signals={signals} groupId="all" />
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
    topTheme: topTheme?.theme_label || `No themes for this group this week.`,
    summary: isTopGroup ? digest.readiness?.readiness_summary ?? '' : '',
    severity: topTheme?.impact ?? 0,
    trend: groupTrend,
    weekId: digest.weekId,
    delta: groupDelta,
  };

  const readinessThemes = (digest.readiness?.themes ?? []).filter((t) =>
    digest.themeBreakdown.some((tb) => tb.theme_id === t.theme_id && tb.feature_group_id === groupId),
  );

  return (
    <div className="space-y-4">
      <OpportunityHero data={heroData} />
      {digest.dataQualityWarning && <DataQualityWarning warning={digest.dataQualityWarning} />}
      {readinessThemes.length > 0 && <ReadinessAlert themes={readinessThemes} />}

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
