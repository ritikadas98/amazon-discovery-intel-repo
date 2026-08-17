import { CONSEQUENCE_LABEL } from '@/lib/vocabulary';
import type { Source, ThemeEvidence } from '@/types';

/**
 * The counted half of the evidence, kept visibly separate from the inferred half.
 *
 * Everything here is arithmetic over the theme's own signals — no model touched
 * it, so a reader can treat it as fact. That distinction is the point of the
 * panel: the badge marks it as counted, and anything the system *concluded*
 * belongs in a differently-marked block beside it, never mixed in.
 */

const SOURCE_LABEL: Record<Source, string> = {
  app_store: 'App Store',
  play_store: 'Play Store',
  amazon_review: 'Amazon Review',
  unknown: 'Unknown',
};

function sourceSentence(ev: ThemeEvidence, total: number): string | null {
  if (ev.sources.length === 0) return null;
  const parts = ev.sources.map((s) => `${s.count} ${SOURCE_LABEL[s.source]}`);
  const where =
    ev.sources.length === 1
      ? `All ${total} from ${SOURCE_LABEL[ev.sources[0].source]}`
      : parts.join(' · ');
  if (!ev.topVersion) return where;
  const v = ev.topVersion;
  const versionBit =
    v.count === total ? `all on ${v.version}` : `${v.count} of ${total} on ${v.version}`;
  return `${where} — ${versionBit}`;
}

export function WhatPeopleReported({
  evidence,
  signalCount,
}: {
  evidence?: ThemeEvidence;
  signalCount: number;
}) {
  // Rows scored before this field existed have no evidence block. Render
  // nothing rather than an empty panel implying nobody reported anything.
  if (!evidence || evidence.sources.length === 0) return null;

  const where = sourceSentence(evidence, signalCount);
  const costly = evidence.consequences.filter((c) => c.consequence !== 'annoyance');

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border bg-card p-4">
      <span
        className="absolute inset-x-0 top-0 h-[3px] bg-emerald-600 dark:bg-emerald-500"
        aria-hidden
      />
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-emerald-600 text-[11px] font-bold text-white dark:bg-emerald-500 dark:text-emerald-950"
          title="Counted straight from the reviews. Nobody interpreted these."
        >
          ✓
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
          What people reported
        </span>
      </div>

      <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {costly.length > 0 && (
          <li>
            {costly.map((c, i) => (
              <span key={c.consequence}>
                {i > 0 && ', '}
                <strong className="font-semibold text-foreground">
                  {c.count} of {signalCount}
                </strong>{' '}
                {CONSEQUENCE_LABEL[c.consequence].toLowerCase()}
              </span>
            ))}
            .
          </li>
        )}
        {where && <li>{where}.</li>}
        {evidence.dateRange && evidence.dateRange.first !== evidence.dateRange.last && (
          <li>
            Reported between {evidence.dateRange.first} and {evidence.dateRange.last}.
          </li>
        )}
      </ul>

      {evidence.quotes.length > 0 && (
        <div className="mt-3 space-y-2 rounded-md bg-muted px-3 py-2.5">
          {evidence.quotes.map((q, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-muted-foreground">
              “{q.text}”
              <span className="ml-1 whitespace-nowrap opacity-70">— {SOURCE_LABEL[q.source]}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
