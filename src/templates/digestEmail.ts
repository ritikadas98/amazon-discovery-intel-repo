import type { GroupSummary, Meta, ReadinessResult, TopGroupView } from '../types.js';

export interface DigestEmailInput {
  groupSummaries: GroupSummary[];
  topGroup: TopGroupView;
  signalCount: number;
  weekId: string;
  meta: Meta;
  readiness: ReadinessResult | null;
}

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
  const { groupSummaries, topGroup, signalCount, weekId, meta, readiness } = input;
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
            <td align="right"><span style="display:inline-block;background:#dc2626;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">${r.signal_count} signal${r.signal_count !== 1 ? 's' : ''}</span></td>
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
          <strong>${t.theme_label}</strong> <span style="color:#9ca3af;">(${t.signal_count} signal${t.signal_count !== 1 ? 's' : ''})</span>
        </td>
      </tr></table>`,
        )
        .join('');

      const d = g.severity_delta;
      let deltaHtml: string;
      if (d === null || d === undefined) deltaHtml = `<span style="font-size:11px;color:#9ca3af;">First run</span>`;
      else if (d === 0) deltaHtml = `<span style="font-size:11px;color:#64748b;">No change</span>`;
      else {
        const isWorse = d > 0;
        const color = isWorse ? '#dc2626' : '#16a34a';
        const arrow = isWorse ? '▲' : '▼';
        deltaHtml = `<span style="font-size:11px;color:${color};font-weight:600;">${arrow} RICE ${Math.abs(d)} vs last week</span>`;
      }

      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid ${MOSCOW_COLOR[g.moscow] || '#64748b'};border-radius:6px;margin-bottom:10px;">
        <tr><td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <span style="font-size:11px;font-weight:600;color:#9ca3af;">#${rank}</span>
              <span style="font-size:15px;font-weight:700;color:#111827;margin-left:4px;">${g.group_name}</span>
            </td>
            <td align="right">
              <span style="font-size:18px;font-weight:700;color:#111827;">${g.rice_score}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:2px;">RICE</span>
            </td>
          </tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
            <td>
              <span style="display:inline-block;background:${MOSCOW_BG[g.moscow] || '#f8fafc'};color:${MOSCOW_COLOR[g.moscow] || '#64748b'};font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">${g.moscow}</span>
              <span style="font-size:12px;color:#6b7280;margin-left:8px;">${g.signal_count} signal${g.signal_count !== 1 ? 's' : ''} · severity ${g.avg_severity} · ${TREND_EMOJI[g.trend_direction] || ''} ${g.trend_direction}</span>
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
            📊 <strong>${signalCount}</strong> signal${signalCount !== 1 ? 's' : ''} synthesized${sourceBreakdown}
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:24px 32px 4px 32px;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
          Top focus this week: <strong style="color:#111827;">${topGroupName}</strong>. ${topGroup.readiness_summary || 'See readiness assessment below.'}
        </p>
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
