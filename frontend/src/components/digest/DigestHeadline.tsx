import { cn } from '@/lib/utils';
import { groupColor } from '@/lib/colors';
import { featureGroupName, formatWeekLabel } from '@/lib/parsers';
import type { ParsedDigest } from '@/lib/parsers';
import type { ThemeBreakdownEntry } from '@/types';

/**
 * The verdict, then the numbers behind it.
 *
 * The page used to open with "140 customer complaints this week, grouped into
 * 10 themes and ranked by priority" — a description of the artefact rather than
 * a finding. A PM opening this on a Monday wants to know what to do, and the
 * count of themes is not that. The headline is now a sentence someone could
 * repeat in a stand-up, and the four figures under it are the ones that would
 * be challenged if they did.
 */

interface Props {
  digest: ParsedDigest;
  /** Every complaint collected for the week, which is larger than the number scored. */
  collectedCount: number;
}

function Kpi({
  label,
  value,
  suffix,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  sub: string;
  tone?: 'critical' | 'negative';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border px-3.5 py-3">
      <span className="text-[10px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold leading-none tracking-tight tabular-nums',
          tone === 'critical' && 'text-amber-600 dark:text-amber-400',
          tone === 'negative' && 'text-red-700 dark:text-red-400',
        )}
      >
        {value}
        {suffix && <span className="ml-0.5 text-sm font-medium text-muted-foreground">{suffix}</span>}
      </span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{sub}</span>
    </div>
  );
}

export function DigestHeadline({ digest, collectedCount }: Props) {
  const themes: ThemeBreakdownEntry[] = digest.themeBreakdown;
  const ranked = [...themes].sort((a, b) => b.system_rice - a.system_rice);
  const lead = ranked.find((t) => t.readiness === 'READY');
  const ready = themes.filter((t) => t.readiness === 'READY').length;
  const scored = themes.reduce((sum, t) => sum + t.signal_count, 0);

  // Money is counted in complaints, not themes: "2 problems" understates it when
  // one of them holds four charges, and overstates it when it holds one.
  const moneyThemes = themes.filter((t) => t.consequence === 'money');
  const moneyComplaints = moneyThemes.reduce((sum, t) => sum + (t.consequence_count ?? 0), 0);

  // The headline names the part of the app, because "start with payments" is a
  // decision and "one theme is ready" is a status.
  const leadGroup = lead ? featureGroupName(lead.feature_group_id) : null;
  const headline = lead
    ? `Start with ${leadGroup?.toLowerCase().replace(/ & /g, ' and ')}.`
    : 'Nothing is ready to act on this week.';

  const leadRank = lead ? ranked.findIndex((t) => t === lead) + 1 : 0;
  const why = lead
    ? `It is the only problem this week with enough behind it to act on.` +
      (leadRank > 1
        ? ` ${leadRank - 1} ${leadRank === 2 ? 'problem is' : 'problems are'} bigger, but neither has enough proof to defend a decision.`
        : '')
    : `All ${themes.length} problems need more proof first. Each row below says what is missing.`;

  // Complaints per part of the app, biggest first. Only groups that actually
  // scored something appear — an empty segment is a lie about coverage.
  const byGroup = new Map<string, number>();
  for (const t of themes) {
    byGroup.set(t.feature_group_id, (byGroup.get(t.feature_group_id) ?? 0) + t.signal_count);
  }
  const segments = [...byGroup.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  const unscored = collectedCount - scored;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
          {formatWeekLabel(digest.weekId)} · {digest.dataSource === 'Sample' ? 'Sample data' : 'Live data'}
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance">{headline}</h1>
        <p className="max-w-[64ch] text-[15px] leading-relaxed text-muted-foreground">
          {lead && <strong className="font-semibold text-foreground">{why.split('.')[0]}.</strong>}
          {lead ? why.slice(why.indexOf('.') + 1) : why}
        </p>
      </div>

      <div className="grid max-w-[1120px] grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Complaints read"
          value={collectedCount.toLocaleString()}
          sub={`${scored} of them sorted into problems`}
        />
        <Kpi
          label="Problems found"
          value={themes.length}
          sub={`across ${byGroup.size} ${byGroup.size === 1 ? 'part' : 'parts'} of the app`}
        />
        <Kpi
          label="Can’t act on yet"
          value={themes.length - ready}
          suffix={`/ ${themes.length}`}
          sub="too few complaints, or all from one place"
          tone="critical"
        />
        <Kpi
          label="Cost people money"
          value={moneyComplaints}
          sub={
            moneyComplaints
              ? `complaints, in ${moneyThemes.length} ${moneyThemes.length === 1 ? 'problem' : 'problems'}`
              : 'none this week'
          }
          tone="negative"
        />
      </div>

      {segments.length > 0 && (
        <div className="max-w-[1120px] space-y-2">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
            Which part of the app the {scored} complaints are about
          </p>
          <div className="flex h-2.5 gap-0.5">
            {segments.map(([id, n]) => (
              <div
                key={id}
                className="rounded-sm"
                style={{ flex: n, backgroundColor: groupColor(id).hex }}
                title={`${featureGroupName(id)} — ${n}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            {segments.map(([id, n]) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: groupColor(id).hex }}
                  aria-hidden
                />
                {featureGroupName(id).split(' ')[0]} {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The gap between collected and scored is the single most misleading thing
          on this page if left unsaid — it is why the sidebar counts and the
          digest counts disagree, and why any week-over-week figure is suspect. */}
      {unscored > 0 && (
        <div className="flex gap-3 rounded-md bg-blue-50 px-4 py-3 text-[13px] leading-relaxed shadow-[inset_3px_0_0_theme(colors.blue.600)] dark:bg-blue-950/40 dark:shadow-[inset_3px_0_0_theme(colors.blue.500)]">
          <span className="font-bold text-blue-700 dark:text-blue-400" aria-hidden>
            ⓘ
          </span>
          <span>
            <strong className="font-semibold">
              {collectedCount} complaints were collected this week, but only {scored} were sorted into
              problems.
            </strong>{' '}
            The pipeline appends rather than replaces, so a second run in the same week sorts only what
            it had at the time. For the same reason, treat any “better or worse than last week” figure
            here with care: it can compare two runs of different sizes rather than two weeks.
          </span>
        </div>
      )}
    </div>
  );
}
