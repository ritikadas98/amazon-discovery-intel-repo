# Response headers

Set in `vercel.json`. JSON has no comments and Vercel rejects extra keys inside a
header object, so the reasoning lives here.

**The policy is measured, not copied.** Loading the live site and recording every
request gives two origins: the site itself, and the Cloud Run API. Nothing else.

- `script-src 'self'` with no `unsafe-inline`. The app has zero inline scripts.
- `style-src` needs `'unsafe-inline'`. React writes inline style attributes, 48 of
  them on first paint, and there are two `<style>` tags.
- `connect-src` **names the backend by URL**. Change the Cloud Run URL without
  changing this line and the dashboard goes blank with only a console error to say
  why. Change both together.
- `frame-ancestors 'none'` is the version browsers still honour. `X-Frame-Options`
  is kept beside it for older ones.

`Strict-Transport-Security` is not here because Vercel already sends it.
