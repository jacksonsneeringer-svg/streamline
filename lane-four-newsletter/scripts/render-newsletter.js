/**
 * render-newsletter.js
 *
 * The single build step that turns this week's data into the final HTML
 * newsletter. Replaces the old build-newsletter.js + build-gear-ratings.js
 * pair — instead of patching a hardcoded HTML file in place, this reads
 * templates/newsletter-template.html (all placeholders, no content) and
 * renders every section from data files:
 *
 *   data/draft-issue.json            - date, hero copy, athlete of the week,
 *                                       "in the water" news items, today's
 *                                       workout blurb, calendar events.
 *                                       Hand-authored each week by an editor,
 *                                       then locked in by check-no-repeats.js.
 *   data/selected-gear.json          - written by select-gear-items.js
 *   data/newsletter-blog-picks.json  - written by fetch-blog-posts.js
 *   data/gear-ratings.json           - (optional) written by
 *                                       fetch-gear-ratings.js; overrides the
 *                                       rating in selected-gear.json when
 *                                       present
 *
 * Run:
 *   node scripts/render-newsletter.js [outputPath]
 *
 * Output (default):
 *   issues/<date>.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'newsletter-template.html');
const DRAFT_PATH = path.join(ROOT, 'data', 'draft-issue.json');
const GEAR_PATH = path.join(ROOT, 'data', 'selected-gear.json');
const GEAR_RATINGS_PATH = path.join(ROOT, 'data', 'gear-ratings.json');
const BLOG_PATH = path.join(ROOT, 'data', 'newsletter-blog-picks.json');

const NEWS_ICONS = {
  doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-top:10px;"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="#2C8C79" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6M9 16h6M9 8h3" stroke="#2C8C79" stroke-width="1.8" stroke-linecap="round"/></svg>',
  trend: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-top:10px;"><path d="M4 20 10 12 14 15 20 6" stroke="#2C8C79" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6h6v6" stroke="#2C8C79" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  medal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-top:10px;"><path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Z" stroke="#2C8C79" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 6H3a3 3 0 0 0 3 5M18 6h3a3 3 0 0 1-3 5" stroke="#2C8C79" stroke-width="1.8" stroke-linecap="round"/></svg>',
  globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-top:10px;"><circle cx="12" cy="12" r="9" stroke="#2C8C79" stroke-width="1.8"/><path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" stroke="#2C8C79" stroke-width="1.6"/></svg>',
};

const CATEGORY_GRADIENTS = {
  Technique: 'linear-gradient(135deg,#1E7F70,#12332C)',
  Training: 'linear-gradient(135deg,#2C8C79,#12332C)',
  Nutrition: 'linear-gradient(135deg,#5FE0CC,#12332C)',
  Gear: 'linear-gradient(135deg,#2C8C79,#0E2E28)',
  Guides: 'linear-gradient(135deg,#1E7F70,#0E2E28)',
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function requireJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${filePath}. ${label}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

function formatDate(dateText) {
  if (!dateText) return '';
  // Date-only strings ("2026-07-01") are parsed as UTC midnight by
  // `new Date()`, which then prints as the previous day in any timezone
  // behind UTC. Parse the y/m/d parts directly as local time to avoid that
  // off-by-one.
  const isoMatch = String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = isoMatch
    ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    : new Date(dateText);
  if (isNaN(parsed)) return escapeHtml(dateText);
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---- In the Water This Week ----
function renderNewsItems(items) {
  return items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      const iconSvg = NEWS_ICONS[item.icon] || NEWS_ICONS.doc;
      const iconCellPadding = isLast ? '14px 0 0 0' : '14px 0 14px 0';
      const textCellPadding = isLast ? '14px 0 0 12px' : '14px 0 14px 12px';
      const border = isLast ? '' : ' border-bottom:1px solid #E3EEE7;';
      return `<tr>
<td width="56" valign="top" style="padding:${iconCellPadding};${border}">
<table cellpadding="0" cellspacing="0"><tr><td style="background-color:#E3F5F0; border-radius:9px; width:40px; height:40px; text-align:center; vertical-align:middle;">
${iconSvg}
</td></tr></table>
</td>
<td valign="top" style="padding:${textCellPadding};${border}">
<div style="font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:16px; color:#0E2E28; margin-bottom:4px;">${escapeHtml(item.title)}</div>
<div style="font-family:'Inter',Arial,sans-serif; font-size:13.5px; color:#4B6259; line-height:1.55;">${item.body}</div>
</td>
</tr>`;
    })
    .join('\n');
}

// ---- Athlete of the Week badges (two per row) ----
function renderAthleteBadges(badges) {
  const rows = [];
  for (let i = 0; i < badges.length; i += 2) {
    const pair = badges.slice(i, i + 2);
    const cells = pair
      .map(
        (b) =>
          `<td style="padding:4px 6px 4px 0;"><span style="display:inline-block; background-color:rgba(95,224,204,0.12); border:1px solid #2C6357; color:#5FE0CC; font-family:'Inter',Arial,sans-serif; font-size:11px; font-weight:600; padding:5px 10px; border-radius:14px;">${escapeHtml(b)}</span></td>`
      )
      .join('\n');
    rows.push(`<tr>\n${cells}\n</tr>`);
  }
  return rows.join('\n');
}

// ---- Gear ----
function starRatingHtml(rating, size /* 'lg' | 'sm' */) {
  const pct = Math.max(0, Math.min(100, Math.round((rating / 5) * 100)));
  const fontSize = size === 'lg' ? '14px' : '12px';
  const numberFontSize = size === 'lg' ? '11.5px' : '11px';
  return `<span style="position:relative; display:inline-block; font-size:${fontSize}; line-height:1; letter-spacing:1px; color:#D9E2DC; vertical-align:middle;">&#9733;&#9733;&#9733;&#9733;&#9733;<span style="position:absolute; top:0; left:0; width:${pct}%; overflow:hidden; white-space:nowrap; color:#F5B400;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></span> <span style="font-family:'Inter',Arial,sans-serif; font-size:${numberFontSize}; color:#4B6259; vertical-align:middle;">${rating.toFixed(1)}</span>`;
}

function renderGearHeroCard(item) {
  return `<tr>
<td style="padding:12px 32px 12px 32px;">
<a href="${item.url}" target="_blank" rel="sponsored noopener" style="text-decoration:none; display:block;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6FAF7; border:1px solid #E3EEE7; border-radius:10px;">
<tr>
<td width="76" valign="top" style="padding:18px 0 18px 20px;">
<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="60" height="60" style="display:block; width:60px; height:60px; object-fit:cover; border-radius:8px; border:1px solid #E3EEE7;" onerror="this.style.display='none';">
</td>
<td style="padding:18px 20px 18px 14px;">
<span style="display:inline-block; background-color:#5FE0CC; color:#0E2E28; font-family:'Inter',Arial,sans-serif; font-weight:700; font-size:10px; letter-spacing:1px; padding:4px 10px; border-radius:14px; text-transform:uppercase;">Gear of the Week</span>
<div style="font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:17px; color:#0E2E28; margin:10px 0 4px 0;">${escapeHtml(item.name)}</div>
<div style="margin:0 0 8px 0;" data-gear-rating-slug="${escapeHtml(item.slug)}">
${starRatingHtml(item.rating, 'lg')}
</div>
<div style="font-family:'Inter',Arial,sans-serif; font-size:13.5px; color:#4B6259; line-height:1.6;">${item.description}</div>
</td>
</tr>
</table>
</a>
</td>
</tr>`;
}

function renderGearRow(item, isLast) {
  const border = isLast ? '' : ' border-bottom:1px solid #E3EEE7;';
  return `<tr>
<td width="52" valign="top" style="padding:10px 12px 10px 0;${border}">
<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="40" height="40" style="display:block; width:40px; height:40px; object-fit:cover; border-radius:6px; border:1px solid #E3EEE7;" onerror="this.style.display='none';">
</td>
<td style="padding:10px 0;${border}">
<div><span style="font-family:'Inter',Arial,sans-serif; font-size:13.5px; color:#0E2E28; line-height:1.55;"><a href="${item.url}" target="_blank" rel="sponsored noopener" style="color:#0E2E28; text-decoration:underline;"><strong>${escapeHtml(item.name)}</strong></a>: <span style="color:#4B6259;">${item.description}</span></span></div>
<div style="margin-top:4px;" data-gear-rating-slug="${escapeHtml(item.slug)}">${starRatingHtml(item.rating, 'sm')}</div>
</td>
</tr>`;
}

// ---- Blog cards ----
function renderBlogCard(post, { isFirst, isLast }) {
  const category = post.category || 'Blog';
  const gradient = CATEGORY_GRADIENTS[category] || CATEGORY_GRADIENTS.Guides;
  const imageSrc = post.localImagePath || post.imageUrl || '';
  const title = escapeHtml(post.title);
  const summary = escapeHtml(truncate(post.summary, 220));
  const date = formatDate(post.date);
  const url = post.url || '#';

  // Matches the original hand-built template's spacing: the first card gets
  // a top gap under the section heading, only the last card gets a bottom
  // gap before the next section, and only non-last cards get the divider
  // border under their text block.
  const outerPadding = `${isFirst ? 12 : 0}px 32px ${isLast ? 8 : 0}px 32px`;
  const textBlockStyle = isLast
    ? 'padding:16px 0 0 0;'
    : 'padding:16px 0 18px 0; border-bottom:1px solid #E3EEE7;';

  return `<tr>
<td style="padding:${outerPadding};">
<a href="${url}" target="_blank" rel="noopener" style="text-decoration:none; display:block;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="background-color:#12332C; background-image:${gradient}; padding:0; text-align:center; line-height:0; border-radius:8px; overflow:hidden;">
<img src="${escapeHtml(imageSrc)}" alt="${title}" width="100%" height="130" style="display:block; width:100%; height:130px; object-fit:cover; border:0;" onerror="this.style.display='none';">
</td>
</tr>
<tr>
<td style="${textBlockStyle}">
<span style="color:#2C8C79; font-family:'Inter',Arial,sans-serif; font-weight:700; font-size:9.5px; letter-spacing:1px; text-transform:uppercase;">${escapeHtml(category)}</span>
<span style="font-family:'Inter',Arial,sans-serif; font-size:11px; color:#8FA69C; margin-left:8px;">${date} &middot; ${escapeHtml(post.readTime || '6 min read')}</span>
<div style="font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:16px; color:#0E2E28; margin:9px 0 6px 0;">${title}</div>
<div style="font-family:'Inter',Arial,sans-serif; font-size:13px; color:#4B6259; line-height:1.55;">${summary}</div>
</td>
</tr>
</table>
</a>
</td>
</tr>`;
}

function renderBlogCards(posts) {
  const picks = posts.slice(0, 3);
  return picks
    .map((post, i) =>
      renderBlogCard(post, { isFirst: i === 0, isLast: i === picks.length - 1 })
    )
    .join('\n\n');
}

// ---- Calendar events ----
function renderEventRow(event, isLast) {
  const border = isLast ? '' : ' style="border-bottom:1px solid #E3EEE7;"';
  const topPadding = isLast ? '0 32px 8px 32px' : '12px 32px 0 32px';
  return `<tr>
<td style="padding:${topPadding};">
<a href="${event.calendarUrl}" target="_blank" rel="noopener" style="text-decoration:none; display:block;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"${border}>
<tr>
<td width="72" style="padding:14px 0;">
<table cellpadding="0" cellspacing="0"><tr><td style="background-color:#12332C; border-radius:8px; width:56px; height:56px; text-align:center; vertical-align:middle;">
<div style="font-family:'Inter',Arial,sans-serif; color:#5FE0CC; font-size:10px; font-weight:700; letter-spacing:1px; padding-top:9px; text-transform:uppercase;">${escapeHtml(event.displayMonth)}</div>
<div style="font-family:'Poppins',Arial,sans-serif; color:#ffffff; font-size:17px; font-weight:700; line-height:1;">${escapeHtml(event.displayDay)}</div>
</td></tr></table>
</td>
<td valign="middle" style="padding:14px 16px 14px 12px;">
<div style="font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:15.5px; color:#0E2E28;">${escapeHtml(event.name)}</div>
<div style="font-family:'Inter',Arial,sans-serif; font-size:13px; color:#4B6259; margin-top:2px;">${event.location}</div>
</td>
<td align="right" valign="middle" style="padding:14px 0; white-space:nowrap;">
<span style="display:inline-block; border:1px solid #BFE6DC; color:#2C8C79; font-family:'Inter',Arial,sans-serif; font-weight:600; font-size:9.5px; letter-spacing:0.5px; padding:5px 10px; border-radius:14px; text-transform:uppercase;">+ Add to Calendar</span>
</td>
</tr>
</table>
</a>
</td>
</tr>`;
}

function renderEventRows(events) {
  return events.map((e, i) => renderEventRow(e, i === events.length - 1)).join('\n\n');
}

// ---- Gear ratings override (optional) ----
function applyGearRatingsOverride(gearItems) {
  if (!fs.existsSync(GEAR_RATINGS_PATH)) return gearItems;
  const ratings = JSON.parse(fs.readFileSync(GEAR_RATINGS_PATH, 'utf8'));
  const bySlug = new Map(ratings.map((r) => [r.slug, r.rating]));
  return gearItems.map((item) => {
    const scraped = bySlug.get(item.slug);
    if (scraped == null) return item;
    return { ...item, rating: scraped };
  });
}

function main() {
  const draft = requireJson(
    DRAFT_PATH,
    'Create it with this week\'s editorial content (see data/draft-issue.example.json) before rendering.'
  );
  let gearItems = requireJson(
    GEAR_PATH,
    'Run `npm run select:gear` first to pick this week\'s gear.'
  );
  const blogPosts = requireJson(
    BLOG_PATH,
    'Run `npm run fetch:blog` first to pick this week\'s blog posts.'
  );

  gearItems = applyGearRatingsOverride(gearItems);

  if (!gearItems.length) {
    console.error('data/selected-gear.json is empty, nothing to render for gear.');
    process.exit(1);
  }
  if (!blogPosts.length) {
    console.error('data/newsletter-blog-picks.json is empty, nothing to render for the blog section.');
    process.exit(1);
  }

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const replacements = {
    '{{ISSUE_DATE_LABEL}}': escapeHtml(draft.issueDateLabel),
    '{{HERO_HEADING}}': escapeHtml(draft.heroHeading),
    '{{HERO_TEASER}}': draft.heroTeaser,
    '{{NEWS_ITEMS}}': renderNewsItems(draft.newsItems),
    '{{ATHLETE_PHOTO_URL}}': escapeHtml(draft.athlete.photoUrl),
    '{{ATHLETE_NAME}}': escapeHtml(draft.athlete.name),
    '{{ATHLETE_BADGES}}': renderAthleteBadges(draft.athlete.badges),
    '{{ATHLETE_BIO}}': draft.athlete.bio,
    '{{GEAR_HEADLINE}}': escapeHtml(draft.gearHeadline || 'Gear Drops & Swim Tech'),
    '{{GEAR_HERO_CARD}}': renderGearHeroCard(gearItems[0]),
    '{{GEAR_ROWS}}': gearItems
      .slice(1)
      .map((item, i, arr) => renderGearRow(item, i === arr.length - 1))
      .join('\n'),
    // Not escaped: this field is authored HTML (e.g. "Wed, Jul 1 &middot; ..."),
    // same treatment as heroTeaser/bio/body elsewhere in this map.
    '{{WORKOUT_DATE_LABEL}}': draft.workout.dateLabel,
    '{{SWIM_SET_TITLE}}': escapeHtml(draft.workout.swimSet.title),
    '{{SWIM_SET_DESC}}': escapeHtml(draft.workout.swimSet.description),
    '{{LIFT_TITLE}}': escapeHtml(draft.workout.lift.title),
    '{{LIFT_DESC}}': escapeHtml(draft.workout.lift.description),
    '{{BLOG_CARDS}}': renderBlogCards(blogPosts),
    '{{EVENT_ROWS}}': renderEventRows(draft.events),
    '{{OUTRO_LINE}}': escapeHtml(draft.outroLine || "That's the week in the water. Happy swimming,"),
    '{{COPYRIGHT_YEAR}}': String(new Date(draft.date || Date.now()).getFullYear()),
  };

  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }

  const remaining = html.match(/\{\{[A-Z_]+\}\}/g);
  if (remaining) {
    console.error(`Template has unfilled placeholders: ${[...new Set(remaining)].join(', ')}`);
    process.exit(1);
  }

  const outputArg = process.argv[2];
  const outputPath = outputArg
    ? path.resolve(outputArg)
    : path.join(ROOT, 'issues', `${draft.date}.html`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
  console.log(`Wrote ${outputPath}`);
}

main();
