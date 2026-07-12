#!/usr/bin/env node
// Generates one real HTML document per site route so every page (and every
// future blog post) is independently crawlable and indexable by Google.
//
//   node scripts/prerender.mjs [--out <dir>]
//
// Reads index.html and derives every route from the same constants the site
// itself runs on — PAGE_TITLES / PAGE_DESCRIPTIONS / NOINDEX_PAGES for static
// pages and BLOG_POSTS for articles — so publishing a new post (per BLOG.md)
// automatically produces its page file, meta tags, structured data, and
// sitemap entry on the next deploy. No entries to maintain here.
//
// For each route it writes <out>/<route>/index.html: a copy of index.html
// with (1) the head block between the SEO:HEAD markers replaced by
// route-specific tags (title, description, canonical, Open Graph/Twitter,
// robots, JSON-LD) and (2) the route's page <div> marked active so the right
// content is present even before JavaScript runs. It also writes sitemap.xml
// listing every indexable URL.
//
// Run by .github/workflows/deploy.yml right before the S3 sync. CloudFront
// rewrites extensionless paths (/swim-sets) to these objects
// (swim-sets/index.html) via the url-rewrite function in
// cloudformation/template.yml.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://winlanefour.com';
const LOGO = SITE + '/email/lane-four-logo.png';
const DEFAULT_IMAGE = SITE + '/swimmer2-bg.jpg';
const HEAD_BEGIN = '<!-- SEO:HEAD:BEGIN';
const HEAD_END = '<!-- SEO:HEAD:END -->';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outIdx = process.argv.indexOf('--out');
const outDir = outIdx > -1 ? resolve(process.argv[outIdx + 1]) : repoRoot;

const html = readFileSync(join(repoRoot, 'index.html'), 'utf8');

// ── Pull the site's own route data out of index.html ───────────────────────
function extractConst(name) {
  const m = html.match(new RegExp('\\nconst ' + name + ' = ([\\[{][\\s\\S]*?\\n[\\]}]);'));
  if (!m) throw new Error('Could not find `const ' + name + '` in index.html');
  return new Function('return ' + m[1] + ';')();
}

const PAGE_TITLES = extractConst('PAGE_TITLES');
const PAGE_DESCRIPTIONS = extractConst('PAGE_DESCRIPTIONS');
const NOINDEX_PAGES = extractConst('NOINDEX_PAGES');
const BLOG_POSTS = extractConst('BLOG_POSTS');
BLOG_POSTS.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

const SECTION_LABELS = { technique: 'Technique', training: 'Training', nutrition: 'Nutrition', gear: 'Gear', guides: 'Guides' };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = obj => '<script type="application/ld+json">' +
  JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';

function postImage(p, w, h) {
  if (!p.heroImage) return DEFAULT_IMAGE;
  if (p.heroImage.startsWith('/')) return SITE + p.heroImage;
  return p.heroImage + (p.heroImage.includes('?') ? '&' : '?') +
    'auto=compress&cs=tinysrgb&fit=crop&w=' + w + '&h=' + h;
}

const breadcrumb = items => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({
    '@type': 'ListItem', position: i + 1, name, item: SITE + url,
  })),
});

const publisher = { '@type': 'Organization', name: 'LANE FOUR', url: SITE + '/', logo: { '@type': 'ImageObject', url: LOGO } };

// ── Assemble the route table ────────────────────────────────────────────────
// { id, title, desc, image, type, lastmod, changefreq, priority, jsonLd[] }
const routes = [];

for (const id of Object.keys(PAGE_TITLES)) {
  if (id === 'home') continue;
  const route = {
    id,
    title: PAGE_TITLES[id],
    desc: PAGE_DESCRIPTIONS[id] || PAGE_DESCRIPTIONS.home,
    image: DEFAULT_IMAGE,
    type: 'website',
    jsonLd: [],
    changefreq: 'monthly',
    priority: '0.5',
  };
  if (id === 'swim-sets' || id === 'dryland-workouts') {
    route.changefreq = 'daily';
    route.priority = '0.9';
  }
  if (id === 'blog' || id.startsWith('blog-')) {
    const section = id === 'blog' ? null : id.replace('blog-', '');
    const posts = section ? BLOG_POSTS.filter(p => p.homeSection === section) : BLOG_POSTS;
    route.changefreq = id === 'blog' ? 'daily' : 'weekly';
    route.priority = id === 'blog' ? '0.8' : '0.6';
    if (posts.length) route.lastmod = posts[0].date;
    route.jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: route.title,
      description: route.desc,
      url: SITE + '/' + id,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: posts.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: p.title, url: SITE + '/' + p.id,
        })),
      },
    });
    const crumbs = [['Home', '/'], ['Blog', '/blog']];
    if (section) crumbs.push([SECTION_LABELS[section] || section, '/' + id]);
    route.jsonLd.push(breadcrumb(crumbs));
  }
  if (id === 'privacy-policy' || id === 'terms-of-use') {
    route.changefreq = 'yearly';
    route.priority = '0.3';
  }
  routes.push(route);
}

for (const p of BLOG_POSTS) {
  const catPage = 'blog-' + p.homeSection;
  routes.push({
    id: p.id,
    title: p.title + ' | LANE FOUR',
    desc: p.excerpt || p.openingText || '',
    image: postImage(p, 1200, 630),
    type: 'article',
    post: p,
    lastmod: p.date,
    changefreq: 'monthly',
    priority: '0.7',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: p.title,
        description: p.excerpt || '',
        image: postImage(p, 1200, 630),
        datePublished: p.date,
        dateModified: p.date,
        url: SITE + '/' + p.id,
        mainEntityOfPage: { '@type': 'WebPage', '@id': SITE + '/' + p.id },
        author: { '@type': 'Organization', name: 'LANE FOUR', url: SITE + '/' },
        publisher,
        articleSection: SECTION_LABELS[p.homeSection] || p.category,
        keywords: (p.keywords || []).join(', '),
      },
      breadcrumb([['Home', '/'], ['Blog', '/blog'],
        [SECTION_LABELS[p.homeSection] || p.category, '/' + catPage], [p.title, '/' + p.id]]),
    ],
  });
}

// ── Emit one HTML document per route ────────────────────────────────────────
const beginAt = html.indexOf(HEAD_BEGIN);
const endAt = html.indexOf(HEAD_END);
if (beginAt === -1 || endAt === -1) throw new Error('SEO:HEAD markers not found in index.html');
const htmlBefore = html.slice(0, beginAt);
const htmlAfter = html.slice(endAt + HEAD_END.length);

function headFor(r) {
  const url = SITE + '/' + r.id;
  const noindex = NOINDEX_PAGES.includes(r.id);
  const lines = [
    HEAD_BEGIN + ' (generated by scripts/prerender.mjs) -->',
    `<title>${esc(r.title)}</title>`,
    `<meta name="description" content="${esc(r.desc)}" />`,
    `<link rel="canonical" href="${url}" />`,
  ];
  if (noindex) lines.push('<meta name="robots" content="noindex" />');
  lines.push(
    `<meta property="og:site_name" content="LANE FOUR" />`,
    `<meta property="og:type" content="${r.type}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(r.title)}" />`,
    `<meta property="og:description" content="${esc(r.desc)}" />`,
    `<meta property="og:image" content="${esc(r.image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(r.title)}" />`,
    `<meta name="twitter:description" content="${esc(r.desc)}" />`,
    `<meta name="twitter:image" content="${esc(r.image)}" />`,
  );
  if (r.post) {
    lines.push(`<meta property="article:published_time" content="${r.post.date}" />`);
    lines.push(`<meta property="article:section" content="${esc(SECTION_LABELS[r.post.homeSection] || r.post.category)}" />`);
  }
  for (const obj of r.jsonLd) lines.push(ld(obj));
  lines.push(HEAD_END);
  return lines.join('\n  ');
}

let written = 0;
for (const r of routes) {
  const homeActive = '<div class="page active" id="page-home">';
  const routeDiv = new RegExp('<div class="page" (id="page-' + r.id + '")');
  if (!html.includes(homeActive) || !routeDiv.test(html)) {
    throw new Error('Could not find page div for route ' + r.id);
  }
  let doc = htmlBefore + headFor(r) + htmlAfter;
  // Show this route's content without JavaScript: home loses the active
  // class, the route's page div gains it. The SPA re-routes on load anyway.
  doc = doc.replace(homeActive, '<div class="page" id="page-home">');
  doc = doc.replace(routeDiv, '<div class="page active" $1');
  mkdirSync(join(outDir, r.id), { recursive: true });
  writeFileSync(join(outDir, r.id, 'index.html'), doc);
  written++;
}

// ── sitemap.xml ─────────────────────────────────────────────────────────────
const newest = BLOG_POSTS.length ? BLOG_POSTS[0].date : new Date().toISOString().slice(0, 10);
const urlXml = (loc, lastmod, changefreq, priority) => [
  '  <url>',
  `    <loc>${loc}</loc>`,
  ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
  `    <changefreq>${changefreq}</changefreq>`,
  `    <priority>${priority}</priority>`,
  '  </url>',
].join('\n');

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generated by scripts/prerender.mjs on each deploy - do not edit by hand. -->',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  urlXml(SITE + '/', newest, 'daily', '1.0'),
  ...routes
    .filter(r => !NOINDEX_PAGES.includes(r.id))
    .map(r => urlXml(SITE + '/' + r.id, r.lastmod, r.changefreq, r.priority)),
  '</urlset>',
  '',
].join('\n');
writeFileSync(join(outDir, 'sitemap.xml'), sitemap);

const indexable = routes.filter(r => !NOINDEX_PAGES.includes(r.id)).length + 1;
console.log(`prerender: wrote ${written} route pages (${indexable} indexable URLs in sitemap.xml, ` +
  `${BLOG_POSTS.length} blog posts) to ${outDir}`);
