// Prefixes every path with /amazon before it is counted, so this app's "/" does
// not merge with the portfolio's "/" in the same GoatCounter dashboard.
// A file rather than an inline <script> on purpose: the CSP allows script-src
// 'self' with no unsafe-inline, and it is not worth weakening that for one line.
window.goatcounter = { path: function (p) { return '/amazon' + p; } };
