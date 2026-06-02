import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GroupReadinessSummary } from '@/components/report/GroupReadinessSummary';
import { ThemeRiceBreakdownTable } from '@/components/report/ThemeRiceBreakdownTable';
import { EvidenceGapCards } from '@/components/report/EvidenceGapCards';
import { NextStepsList } from '@/components/report/NextStepsList';
import { SourceBadge } from '@/components/digest/SourceBadge';
import { api } from '@/lib/api';
import { parseDigestRow, rowSource } from '@/lib/parsers';
import { useActiveGroup, useActiveSource, useActiveWeek } from '@/lib/url-state';
import type { Readiness } from '@/types';

export function ReportPage() {
  const group = useActiveGroup();
  const activeWeek = useActiveWeek();
  const activeSource = useActiveSource();

  const digestsQuery = useQuery({
    queryKey: ['digests', 20],
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

  const effortQuery = useQuery({
    queryKey: ['effort', digest?.weekId],
    queryFn: () => api.effortOverrides(digest!.weekId),
    enabled: !!digest?.weekId,
  });

  if (group === 'all') {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <p className="text-sm font-medium">Discovery Report needs a specific feature group.</p>
          <p className="text-xs text-muted-foreground">
            Pick a group from the sidebar to view its theme RICE breakdown.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (digestsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[120px]" />
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (!digest) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No pipeline runs yet. Click "Run pipeline" in the top bar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const groupThemes = digest.themeBreakdown.filter((t) => t.feature_group_id === group);
  const isTopGroup = digest.topGroupId === group;

  // Map readiness counts for the readiness summary section.
  const themesTotal = groupThemes.length;
  const themesReady = groupThemes.filter((t) => t.readiness === 'READY').length;
  const themesNeedsEvidence = groupThemes.filter((t) => t.readiness === 'NEEDS_MORE_EVIDENCE').length;
  const themesBlocked = groupThemes.filter((t) => t.readiness === 'BLOCKED').length;

  // Overall readiness for the group: AI-assessed if top group, else the worst theme readiness.
  let overallReadiness: Readiness | null = null;
  if (isTopGroup && digest.overallReadiness) {
    overallReadiness = digest.overallReadiness;
  } else if (themesTotal > 0) {
    if (themesBlocked > 0) overallReadiness = 'BLOCKED';
    else if (themesNeedsEvidence > 0) overallReadiness = 'NEEDS_MORE_EVIDENCE';
    else overallReadiness = 'READY';
  }

  return (
    <div className="space-y-4">
      <SourceBadge source={digest.dataSource} pulledAt={digest.createdAt} />
      <GroupReadinessSummary
        groupId={group}
        weekId={digest.weekId}
        overallReadiness={overallReadiness}
        summary={isTopGroup ? digest.readiness?.readiness_summary : undefined}
        themesReady={themesReady}
        themesTotal={themesTotal}
        themesNeedsEvidence={themesNeedsEvidence}
      />

      <ThemeRiceBreakdownTable
        themes={groupThemes}
        weekId={digest.weekId}
        overrides={effortQuery.data?.overrides ?? []}
      />

      <EvidenceGapCards themes={groupThemes} />

      <NextStepsList themes={groupThemes} groupId={group} />
    </div>
  );
}
