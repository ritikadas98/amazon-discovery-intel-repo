import type { Meta } from '../types.js';

export interface RegressionEmailInput {
  meta: Meta;
}

export function renderRegressionEmail({ meta }: RegressionEmailInput): { subject: string; html: string } {
  const regressions = meta.regressions || [];
  const weekId = meta.weekId || '';
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const cards = regressions
    .map(
      (r) => `
    <tr><td style="padding:12px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f7;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:14px 16px 10px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:15px;font-weight:700;color:#111827;">Version ${r.version}</span></td>
            <td align="right"><span style="display:inline-block;background:#dc2626;color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">${r.signal_count} signal${r.signal_count !== 1 ? 's' : ''}</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 16px;"><hr style="border:none;border-top:1px solid #fecaca;margin:0;" /></td></tr>
        <tr><td style="padding:10px 16px 14px 16px;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#9ca3af;text-transform:uppercase;">Top Signals</p>
          ${(r.top_signals || [])
            .slice(0, 3)
            .map(
              (s) => `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;"><tr>
              <td width="16" valign="top" style="padding-top:2px;font-size:13px;color:#dc2626;">•</td>
              <td style="font-size:13px;color:#374151;line-height:1.5;">${s}</td>
            </tr></table>`,
            )
            .join('')}
        </td></tr>
      </table>
    </td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Version Regression Detected</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

      <tr><td style="background:#dc2626;padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;color:#fca5a5;text-transform:uppercase;">Amazon Discovery Intelligence</p>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">⚠️ Version Regression Detected</h1>
          </td>
          <td align="right" valign="top">
            <span style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:4px;padding:6px 12px;font-size:12px;color:#ffffff;font-weight:600;white-space:nowrap;">URGENT</span>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:#fef2f2;padding:14px 32px;border-bottom:1px solid #fee2e2;">
        <span style="font-size:13px;color:#b91c1c;">
          📅 <strong>${dateStr}</strong> &nbsp;&nbsp;·&nbsp;&nbsp; 🗓 Week: <strong>${weekId}</strong>
        </span>
      </td></tr>

      <tr><td style="padding:28px 32px 8px 32px;">
        <p style="margin:0 0 6px 0;font-size:14px;color:#374151;line-height:1.6;">
          The pipeline detected <strong style="color:#dc2626;">${regressions.length} version(s)</strong> with a spike in negative signals this run. Immediate review is recommended.
        </p>
      </td></tr>

      ${cards}

      <tr><td style="padding:20px 32px 28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:6px;">
          <tr><td style="padding:16px;">
            <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#991b1b;">Action Required</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Review the flagged versions and cross-check with recent releases. If a regression is confirmed, escalate to the engineering team immediately.</p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
          Sent automatically by <strong style="color:#6b7280;">Amazon Discovery Intelligence</strong> · Do not reply to this email
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;

  return {
    subject: `⚠️ Version Regression Alert — ${dateStr}`,
    html,
  };
}
