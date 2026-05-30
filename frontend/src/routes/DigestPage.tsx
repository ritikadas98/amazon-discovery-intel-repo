import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityHero, type OpportunityHeroData } from '@/components/digest/OpportunityHero';
import { RankingTable } from '@/components/digest/RankingTable';
import { ReadinessAlert } from '@/components/digest/ReadinessAlert';
import { DataQualityWarning } from '@/components/digest/DataQualityWarning';
import { SignalSparkline } from '@/components/digest/SignalSparkline';
import { api } from '@/lib/api';
import { parseDigestRow } from '@/lib/parsers';
import { useActiveGroup, useActiveWeek } from '@/lib/url-state';

export function DigestPage() {
  const activeGroup = useActiveGroup();
  const activeWeek = useActiveWeek();

  // Fetch the right digest row: pinned week if param present, else latest
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

  // For sparkline: fetch the week's signals (filtered by group if not 'all')
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

  // Build hero data — for a specific group, find its top theme from themeBreakdown
  const heroData: OpportunityHeroData = (() => {
    if (activeGroup === 'all') {
      return {
        groupId: 'all',
        topTheme: digest.themeBreakdown
          .slice()
          .sort((a, b) => b.system_rice - a.system_rice)[0]?.theme_label || digest.topTheme,
        summary: digest.readiness?.readiness_summary ?? '',
        severity: digest.avgSeverity,
        trend: digest.trend,
        weekId: digest.weekId,
        delta: digest.wow.find((w) => w.id === digest.topGroupId) ?? null,
      };
    }
    const groupThemes = digest.themeBreakdown
      .filter((t) => t.feature_group_id === activeGroup)
      .sort((a, b) => b.system_rice - a.system_rice);
    const topTheme = groupThemes[0];
    const groupTrend = digest.trends.find((t) => t.id === activeGroup)?.trend ?? null;
    const groupDelta = digest.wow.find((w) => w.id === activeGroup) ?? null;
    const isTopGroup = digest.topGroupId === activeGroup;
    return {
      groupId: activeGroup,
      topTheme: topTheme?.theme_label || `No themes for ${activeGroup}`,
      summary: isTopGroup ? (digest.readiness?.readiness_summary ?? '') : '',
      severity: topTheme?.impact ?? 0,
      trend: groupTrend,
      weekId: digest.weekId,
      delta: groupDelta,
    };
  })();

  // For non-"all" groups, derive a "themes for this group" readiness list
  const readinessThemes = activeGroup === 'all'
    ? (digest.readiness?.themes ?? [])
    : (digest.readiness?.themes ?? []).filter((t) =>
        digest.themeBreakdown.some((tb) => tb.theme_id === t.theme_id && tb.feature_group_id === activeGroup),
      );

  return (
    <div className="space-y-4">
      <OpportunityHero data={heroData} />

      {digest.dataQualityWarning && <DataQualityWarning warning={digest.dataQualityWarning} />}

      {readinessThemes.length > 0 && <ReadinessAlert themes={readinessThemes} />}

      <RankingTable digest={digest} />

      <SignalSparkline signals={signalsQuery.data?.rows ?? []} groupId={activeGroup} />
    </div>
  );
}
