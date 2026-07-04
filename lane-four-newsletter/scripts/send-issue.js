/**
 * send-issue.js
 *
 * Broadcasts the rendered weekly issue to every subscriber by invoking the
 * streamline-newsletter-send Lambda in rawHtml mode (the Lambda swaps each
 * recipient's one-click unsubscribe link into the {{UNSUBSCRIBE_URL}} token
 * and sends via Resend). Subject and preheader come from the composed
 * data/draft-issue.json.
 *
 * Run (needs AWS credentials with lambda:InvokeFunction):
 *   node scripts/send-issue.js                       # send to the full list
 *   NEWSLETTER_TEST_EMAIL=me@x.com node scripts/send-issue.js   # preview only
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DRAFT_PATH = path.join(ROOT, 'data', 'draft-issue.json');
const SEND_FUNCTION = process.env.NEWSLETTER_SEND_FUNCTION || 'streamline-newsletter-send';

function invokeLambda(functionName, payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-four-'));
  const payloadPath = path.join(dir, 'payload.json');
  const outPath = path.join(dir, 'out.json');
  fs.writeFileSync(payloadPath, JSON.stringify(payload));
  execFileSync(
    'aws',
    [
      'lambda', 'invoke',
      '--function-name', functionName,
      '--cli-binary-format', 'raw-in-base64-out',
      '--payload', `file://${payloadPath}`,
      outPath,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  const result = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  if (result && result.errorMessage) {
    throw new Error(`${functionName} failed: ${result.errorMessage}`);
  }
  return result;
}

function main() {
  const draft = JSON.parse(fs.readFileSync(DRAFT_PATH, 'utf8'));
  const issuePath = path.join(ROOT, 'issues', `${draft.date}.html`);
  const rawHtml = fs.readFileSync(issuePath, 'utf8');

  // Safety gate: the only placeholder allowed to survive rendering is the
  // per-recipient unsubscribe token. Anything else means a broken render —
  // refuse to email it to the whole list.
  const leftovers = [...new Set(rawHtml.match(/\{\{[A-Z_]+\}\}/g) || [])].filter(
    (t) => t !== '{{UNSUBSCRIBE_URL}}'
  );
  if (leftovers.length) {
    throw new Error(`Refusing to send: unrendered placeholders in ${issuePath}: ${leftovers.join(', ')}`);
  }
  if (!rawHtml.includes('{{UNSUBSCRIBE_URL}}')) {
    throw new Error(`Refusing to send: ${issuePath} has no {{UNSUBSCRIBE_URL}} token, so recipients would have no unsubscribe link.`);
  }

  const testEmail = (process.env.NEWSLETTER_TEST_EMAIL || '').trim();
  const payload = {
    subject: draft.subject,
    preheader: draft.preheader || '',
    heading: draft.subject,
    body: `${draft.heroTeaser || draft.subject}\n\nRead this week's issue: https://winlanefour.com/issues/${draft.date}.html`,
    rawHtml,
    ...(testEmail ? { test: testEmail } : {}),
  };

  console.log(
    testEmail
      ? `Sending PREVIEW of ${draft.date} issue to ${testEmail}...`
      : `Sending ${draft.date} issue to the full subscriber list...`
  );
  const result = invokeLambda(SEND_FUNCTION, payload);
  const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body || {};
  console.log(`Send result: sent=${body.sent} skipped=${body.skipped} errors=${(body.errors || []).length}`);
  for (const err of body.errors || []) console.error(`  send error: ${err}`);
  if (!testEmail && !body.sent) {
    throw new Error('Newsletter send reported 0 deliveries.');
  }
}

main();
