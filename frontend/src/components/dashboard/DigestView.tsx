import { RegressionBanner } from './RegressionBanner';
import { KPIStrip } from './KPIStrip';
import { FeatureGroupRankings } from './FeatureGroupRankings';
import { ReadinessSection } from './ReadinessSection';
import type { ParsedDigest } from '@/lib/parsers';

interface Props {
  digest: ParsedDigest;
  /** When true, the regression count banner is shown if regressions > 0. */
  showRegressionBanner?: boolean;
  /** Override the inferred regression count (default: not shown). */
  regressionCount?: number;
}

export function DigestView({ digest, showRegressionBanner = true, regressionCount = 0 }: Props) {
  return (
    <div className="space-y-5">
      {showRegressionBanner && (
        <RegressionBanner count={regressionCount} weekId={digest.weekId} />
      )}
      {digest.dataQualityWarning && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <span className="font-medium">Data quality:</span> {digest.dataQualityWarning}
        </div>
      )}
      <KPIStrip digest={digest} />
      <FeatureGroupRankings digest={digest} />
      <ReadinessSection digest={digest} />
    </div>
  );
}
