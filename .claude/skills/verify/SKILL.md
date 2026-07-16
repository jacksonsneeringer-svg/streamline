---
name: verify
description: Run and drive the LANE FOUR site locally to verify changes to index.html or the CloudFormation Lambdas.
---

# Verifying LANE FOUR changes locally

The site is a single-page app in `index.html`; the backend is Python Lambdas
embedded as `ZipFile: |` blocks in `cloudformation/template.yml` behind
API Gateway routes (`POST/GET /auth/{action}`, `GET /daily-sets`, ...).
There is no deployed test environment, but the Lambda code can be run
locally without AWS.

## Recipe that works

1. **Extract a Lambda**: find its `FunctionName:` in the template, then take
   the following `ZipFile: |` block (dedent by the block indent). `exec()` it
   with `boto3` stubbed in `sys.modules` (in-memory dict-backed `Table` with
   `get_item`/`put_item`/`delete_item`/`scan`; table keys: users→`email`,
   auth-tokens→`token`, contacts→`id`). Stub the module's `send_email` after
   exec so nothing hits resend.com.
2. **Serve the site + API from one origin**: a `ThreadingHTTPServer` on
   localhost that routes `/auth/*` into the Lambda `handler` (build an event
   with `pathParameters.action`, `queryStringParameters`, `body`), serves the
   repo dir statically, and returns `index.html` for any extension-less path
   (the SPA rewrites URLs — without this fallback, reloads 404). Serve
   `/api-config.js` as `window.STREAMLINE_API_URL="http://localhost:PORT"`.
   Stub `/daily-sets` with a small `{setId, date, level, title, totalYards,
   sections:[{name, yards, items:[{text, note}]}]}` payload so set cards
   (and their favorite buttons) render.
3. **Drive with Playwright** (`executablePath: '/opt/pw-browsers/chromium'`,
   `npm i playwright` — browsers are pre-installed). Navigate via the app's
   own `page.evaluate(() => navigate('swim-sets'))`; page ids are the
   `id="page-*"` divs (e.g. `swim-sets`, `sign-in`, `my-training`). Sign in
   by filling `#signin-email`/`#signin-password` then `signIn()`.

## Gotchas

- External images (pexels) fail through the proxy — harmless noise.
- Fresh-localStorage tests need a new `browser.newContext()`.
- Favorite buttons are `.fav-btn[data-fav-id]`; debounced server syncs fire
  after 800 ms, so wait ~1.3 s before asserting server state.
