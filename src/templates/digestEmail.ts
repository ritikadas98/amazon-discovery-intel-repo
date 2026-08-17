import type { GroupSummary, Meta, ReadinessResult, TopGroupView } from '../types.js';

export interface DigestEmailInput {
  groupSummaries: GroupSummary[];
  topGroup: TopGroupView;
  signalCount: number;
  weekId: string;
  meta: Meta;
  readiness: ReadinessResult | null;
  /** Public-facing base URL of the API (for feedback link generation). */
  baseUrl: string;
  /**
   * Where the dashboard lives. A different host from `baseUrl`, which is the
   * API — sending a reader there lands them on a JSON endpoint.
   */
  appUrl: string;
  /** Email recipient — baked into the feedback URL so we can attribute clicks. */
  recipientEmail: string;
}

function buildFeedbackButtons(
  baseUrl: string,
  themeId: string,
  featureGroupId: string,
  weekId: string,
  pmEmail: string,
): string {
  const url = (rating: 'doing' | 'not_now') =>
    `${baseUrl}/webhook/digest-feedback?theme_id=${encodeURIComponent(themeId)}` +
    `&feature_group_id=${encodeURIComponent(featureGroupId)}` +
    `&week_id=${encodeURIComponent(weekId)}&rating=${rating}` +
    `&pm_email=${encodeURIComponent(pmEmail)}`;
  return `
    <table cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
      <td style="padding-right:6px;">
        <a href="${url('doing')}" style="display:inline-block;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:4px 10px;font-size:12px;font-weight:600;border-radius:14px;text-decoration:none;">Doing this</a>
      </td>
      <td>
        <a href="${url('not_now')}" style="display:inline-block;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;padding:4px 10px;font-size:12px;font-weight:600;border-radius:14px;text-decoration:none;">Not this week</a>
      </td>
    </tr></table>`;
}

/**
 * Deep link into the dashboard, scoped to what the reader was just looking at.
 *
 * The week is always carried rather than defaulting to "latest": rows append
 * and are never deleted, so a link in a six-week-old email still opens the week
 * that email was about. A link that quietly shows a different week is worse
 * than no link.
 */
function appLink(appUrl: string, path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${appUrl.replace(/\/$/, '')}${path}?${qs}`;
}

const CONSEQUENCE_LABEL: Record<string, string> = {
  money: 'Lost money',
  lost: 'Order never came',
  blocked: 'Couldn’t finish',
  annoyance: 'Just annoyed',
};

/** Cost, not tone. Only money gets red — see the dashboard's CONSEQUENCE_CLASS. */
const CONSEQUENCE_COLOR: Record<string, string> = {
  money: '#b91c1c',
  lost: '#c2410c',
  blocked: '#b45309',
  annoyance: '#64748b',
};

const TREND_EMOJI: Record<string, string> = { worsening: '📈', stable: '➡️', improving: '📉' };
const TREND_COLOR: Record<string, string> = { worsening: '#dc2626', stable: '#64748b', improving: '#16a34a' };
const MOSCOW_COLOR: Record<string, string> = {
  'Must Have': '#dc2626',
  'Should Have': '#ea580c',
  'Could Have': '#ca8a04',
  "Won't Have": '#64748b',
};
const MOSCOW_BG: Record<string, string> = {
  'Must Have': '#fef2f2',
  'Should Have': '#fff7ed',
  'Could Have': '#fefce8',
  "Won't Have": '#f8fafc',
};
const READINESS_EMOJI: Record<string, string> = { READY: '✅', NEEDS_MORE_EVIDENCE: '⚠️', BLOCKED: '❌' };
const READINESS_COLOR: Record<string, string> = {
  READY: '#16a34a',
  NEEDS_MORE_EVIDENCE: '#ca8a04',
  BLOCKED: '#dc2626',
};
const READINESS_BG: Record<string, string> = {
  READY: '#f0fdf4',
  NEEDS_MORE_EVIDENCE: '#fefce8',
  BLOCKED: '#fef2f2',
};

export function renderDigestEmail(input: DigestEmailInput): { subject: string; html: string } {
  const { groupSummaries, topGroup, signalCount, weekId, meta, readiness, baseUrl, appUrl, recipientEmail } =
    input;
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  let regressionsBlock = '';
  if (meta.regressions && meta.regressions.length > 0) {
    const cards = meta.regressions
      .map(
        (r) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f7;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:6px;margin-bottom:8px;">
        <tr><td style="padding:12px 16px 8px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:14px;font-weight:700;color:#111827;">Version ${r.version}</span></td>
            <td align="right"><span style="display:inline-block;background:#dc2626;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">${r.signal_count} complaint${r.signal_count !== 1 ? 's' : ''}</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 16px 12px 16px;">
          ${(r.top_signals || [])
            .slice(0, 2)
            .map(
              (s) => `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
              <td width="16" valign="top" style="padding-top:2px;font-size:13px;color:#dc2626;">•</td>
              <td style="font-size:13px;color:#374151;line-height:1.5;">${s}</td>
            </tr></table>`,
            )
            .join('')}
        </td></tr>
      </table>`,
      )
      .join('');
    regressionsBlock = `
      <tr><td style="padding:20px 32px 4px 32px;">
        <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#9ca3af;text-transform:uppercase;">⚠️ Regression Alert</p>
        ${cards}
      </td></tr>`;
  }

  let qualityBlock = '';
  if (meta.dataQualityWarning) {
    qualityBlock = `
      <tr><td style="padding:8px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:6px;">
          <tr><td style="padding:10px 14px;font-size:13px;color:#7c2d12;line-height:1.5;">
            <strong>Data Quality:</strong> ${meta.dataQualityWarning}
          </td></tr>
        </table>
      </td></tr>`;
  }

  // The group the email opens with: the top group when it has a finding,
  // otherwise the first group that does. A digest that leads with a bare
  // category label has wasted the only line most readers will read.
  const lead =
    groupSummaries.find((g) => g.group_id === topGroup.group_id && g.headline) ??
    groupSummaries.find((g) => g.headline);

  // "First run" is only true when NO group has a delta. If any group has one
  // there was a previous week, so a missing delta means the formula changed
  // rather than that this is week one.
  const isFirstRun = groupSummaries.every(
    (g) => g.severity_delta === null || g.severity_delta === undefined,
  );

  const topGroupName = topGroup.group_name || topGroup.group_id || 'top group';
  const overallReadiness = topGroup.readiness || 'NEEDS_MORE_EVIDENCE';
  const themesHtml = (readiness?.themes || [])
    .map(
      (t) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;">
      <tr><td style="padding:10px 14px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:13px;font-weight:600;color:#111827;">${t.theme_label}</span></td>
          <td align="right"><span style="font-size:12px;font-weight:600;color:${READINESS_COLOR[t.readiness] || '#6b7280'};">${READINESS_EMOJI[t.readiness] || ''} ${t.readiness}</span></td>
        </tr></table>
        ${t.gap_reasons && t.gap_reasons.length ? `<p style="margin:6px 0 0 0;font-size:12px;color:#6b7280;line-height:1.5;"><strong>Gaps:</strong> ${t.gap_reasons.join(' · ')}</p>` : ''}
        ${t.recommended_next_steps && t.recommended_next_steps.length ? `<p style="margin:4px 0 0 0;font-size:12px;color:#4f46e5;line-height:1.5;"><strong>Next:</strong> ${t.recommended_next_steps[0]}</p>` : ''}
        ${buildFeedbackButtons(baseUrl, t.theme_id, topGroup.group_id, weekId, recipientEmail)}
      </td></tr>
    </table>`,
    )
    .join('');

  const readinessBlock = `
    <tr><td style="padding:8px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${READINESS_BG[overallReadiness] || '#f8fafc'};border:1px solid #e5e7eb;border-left:4px solid ${READINESS_COLOR[overallReadiness] || '#4f46e5'};border-radius:6px;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#9ca3af;text-transform:uppercase;">Discovery Readiness · ${topGroupName}</p>
          <p style="margin:0;font-size:13px;color:${READINESS_COLOR[overallReadiness] || '#374151'};font-weight:600;">${READINESS_EMOJI[overallReadiness] || ''} ${String(overallReadiness).replace(/_/g, ' ')}</p>
          ${topGroup.readiness_summary ? `<p style="margin:6px 0 0 0;font-size:13px;color:#374151;line-height:1.5;">${topGroup.readiness_summary}</p>` : ''}
          ${themesHtml}
        </td></tr>
      </table>
    </td></tr>`;

  const rankingCards = groupSummaries
    .map((g, i) => {
      const rank = i + 1;
      const themesList = (g.themes || [])
        .map(
          (t) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr>
        <td width="20" valign="top" style="padding-top:2px;font-size:12px;color:${TREND_COLOR[t.trend_direction] || '#64748b'};">${TREND_EMOJI[t.trend_direction] || '·'}</td>
        <td style="font-size:13px;color:#374151;line-height:1.5;">
          <strong>${t.theme_label}</strong> <span style="color:#9ca3af;">(${t.signal_count} complaint${t.signal_count !== 1 ? 's' : ''})</span>
        </td>
      </tr></table>`,
        )
        .join('');

      // This field carries the SCORE delta despite its name (see run.ts). It is
      // null both on a first run and when the scoring formula changed between
      // the two weeks — and calling the second one "First run" in week 40 would
      // be a plain falsehood, so they are told apart.
      const d = g.severity_delta;
      let deltaHtml: string;
      if (d === null || d === undefined)
        deltaHtml = `<span style="font-size:11px;color:#9ca3af;">${
          isFirstRun ? 'First run' : 'Not comparable with last week'
        }</span>`;
      else if (d === 0) deltaHtml = `<span style="font-size:11px;color:#64748b;">No change</span>`;
      else {
        const isWorse = d > 0;
        const color = isWorse ? '#dc2626' : '#16a34a';
        const arrow = isWorse ? '▲' : '▼';
        deltaHtml = `<span style="font-size:11px;color:${color};font-weight:600;">${arrow} ${Math.abs(d)} vs last week</span>`;
      }

      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid ${MOSCOW_COLOR[g.moscow] || '#64748b'};border-radius:6px;margin-bottom:10px;">
        <tr><td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <span style="font-size:11px;font-weight:600;color:#9ca3af;">#${rank}</span>
              <a href="${appLink(appUrl, '/digest', { group: g.group_id, week: weekId })}" style="font-size:15px;font-weight:700;color:#111827;margin-left:4px;text-decoration:none;">${g.group_name} &rsaquo;</a>
            </td>
            <td align="right">
              <span style="font-size:18px;font-weight:700;color:#111827;">${g.rice_score}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:2px;">size</span>
            </td>
          </tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
            <td>
              <span style="display:inline-block;background:${MOSCOW_BG[g.moscow] || '#f8fafc'};color:${MOSCOW_COLOR[g.moscow] || '#64748b'};font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${g.moscow}</span>
              <span style="font-size:12px;color:#6b7280;margin-left:8px;">${g.signal_count} complaint${g.signal_count !== 1 ? 's' : ''} · how upset ${g.avg_severity}${
                g.consequence
                  ? ` · <strong style="color:${CONSEQUENCE_COLOR[g.consequence]};">${CONSEQUENCE_LABEL[g.consequence]}${
                      g.consequence_count ? ` ${g.consequence_count}/${g.signal_count}` : ''
                    }</strong>`
                  : ''
              } · ${TREND_EMOJI[g.trend_direction] || ''} ${g.trend_direction}</span>
            </td>
            <td align="right">${deltaHtml}</td>
          </tr></table>
          ${themesList ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">${themesList}</div>` : ''}
        </td></tr>
      </table>`;
    })
    .join('');

  const sourceBreakdown = meta.sourceBreakdown
    ? `<br><span style="color:#94a3b8;">from ${meta.sourceBreakdown.total || ''} raw · App Store: ${meta.sourceBreakdown.app_store || 0} · Play Store: ${meta.sourceBreakdown.play_store || 0} · Amazon Reviews: ${meta.sourceBreakdown.amazon_review || 0}</span>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Amazon Discovery Digest</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

      <tr><td style="background:#1e293b;padding:24px 32px;">
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;color:#94a3b8;text-transform:uppercase;">Amazon Discovery Intelligence</p>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">🔍 Weekly Discovery Digest</h1>
      </td></tr>

      <tr><td style="background:#f1f5f9;padding:14px 32px;border-bottom:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:13px;color:#475569;">
            📅 <strong>${dateStr}</strong> &nbsp;&nbsp;·&nbsp;&nbsp; 🗓 Week: <strong>${weekId}</strong>
          </td>
          <td align="right" style="font-size:12px;color:#64748b;">
            📊 <strong>${signalCount}</strong> complaint${signalCount !== 1 ? 's' : ''} read${sourceBreakdown}
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:24px 32px 4px 32px;">
        ${
          lead?.headline
            ? `<p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:1px;color:#dc2626;text-transform:uppercase;">Start here · ${topGroupName}</p>
        <p style="margin:0;font-size:19px;font-weight:700;color:#111827;line-height:1.35;">${lead.headline}</p>`
            : `<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
          Top focus this week: <strong style="color:#111827;">${topGroupName}</strong>. ${topGroup.readiness_summary || 'See readiness assessment below.'}
        </p>`
        }
      </td></tr>

      ${
        lead?.first_move
          ? `<tr><td style="padding:12px 32px 4px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;">
          <tr><td style="padding:12px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="display:inline-block;background:#dc2626;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:1px;padding:3px 9px;border-radius:12px;">▲ DO THIS FIRST</span></td>
              <td align="right"><span style="font-size:11px;font-weight:600;color:#7f1d1d;">${lead.first_move.owner} · ${lead.first_move.effort}</span></td>
            </tr></table>
            <p style="margin:9px 0 0 0;font-size:15px;font-weight:700;color:#111827;line-height:1.4;">${lead.first_move.action}</p>
            <p style="margin:5px 0 0 0;font-size:12.5px;color:#6b7280;line-height:1.55;">${lead.first_move.rationale}</p>
          </td></tr>
        </table>
      </td></tr>`
          : ''
      }

      <tr><td style="padding:14px 32px 4px 32px;" align="center">
        <a href="${appLink(appUrl, '/digest', { week: weekId })}" style="display:inline-block;background:#1e293b;color:#ffffff;font-size:14px;font-weight:600;padding:11px 26px;border-radius:6px;text-decoration:none;">Open the digest</a>
        <p style="margin:7px 0 0 0;font-size:11px;color:#94a3b8;">Opens week ${weekId}, with every problem and the evidence behind it.</p>
      </td></tr>

      ${regressionsBlock}
      ${qualityBlock}
      ${readinessBlock}

      <tr><td style="padding:20px 32px 4px 32px;">
        <p style="margin:0 0 12px 0;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#9ca3af;text-transform:uppercase;">📊 Feature Group Rankings</p>
        ${rankingCards}
      </td></tr>

      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">
          Generated automatically by <strong style="color:#6b7280;">Amazon Discovery Intelligence</strong> · ${new Date().toISOString()}<br>
          Do not reply to this email
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;

  return {
    subject: `🔍 Discovery Digest — ${dateStr}`,
    html,
  };
}
