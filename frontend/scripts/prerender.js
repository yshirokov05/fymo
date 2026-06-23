#!/usr/bin/env node
/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────────
// Static prerender step — runs AFTER `react-scripts build`.
//
// For each public route in seo-routes.js it takes the built build/index.html,
// rewrites the per-page SEO tags (title, description, canonical, Open Graph,
// Twitter) and injects real body copy into <div id="root">, then writes the
// result to build/<out>/index.html. Firebase Hosting serves those static files
// directly (a real file always beats the SPA "**" rewrite), so crawlers and
// link unfurlers get unique, content-rich HTML per URL. The React bundle still
// loads and mounts over it via createRoot — users get the live SPA unchanged.
//
// HARD RULE: this script must NEVER fail the production build. The deploy
// pipeline runs `npm run build`, so any throw here would block a deploy. Every
// step is wrapped; on any error we log and exit 0, leaving the normal SPA
// behavior (the pre-prerender status quo) intact.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

function main() {
  const buildDir = path.resolve(__dirname, '..', 'build');
  const templatePath = path.join(buildDir, 'index.html');

  if (!fs.existsSync(templatePath)) {
    console.warn('[prerender] build/index.html not found — skipping (did the build run?)');
    return;
  }

  let SITE, routes;
  try {
    ({ SITE, routes } = require('./seo-routes'));
  } catch (e) {
    console.warn('[prerender] could not load seo-routes.js — skipping:', e.message);
    return;
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  let written = 0;

  for (const route of routes) {
    try {
      const html = renderRoute(template, route, SITE);
      const outDir = route.out ? path.join(buildDir, route.out) : buildDir;
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
      written++;
    } catch (e) {
      // One bad route should not abort the rest, and certainly not the build.
      console.warn(`[prerender] failed for ${route.url}:`, e.message);
    }
  }

  console.log(`[prerender] wrote ${written}/${routes.length} static route(s).`);
}

// Escape text destined for HTML body / attribute values.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Replace the content="..." of a meta tag identified by name= or property=.
function setMeta(html, attr, key, value) {
  const re = new RegExp(
    `(<meta\\s+${attr}=["']${escapeRe(key)}["']\\s+content=["'])[^"']*(["'])`,
    'i'
  );
  if (re.test(html)) return html.replace(re, `$1${esc(value)}$2`);
  return html; // tag absent in template — leave as-is
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderRoute(template, route, SITE) {
  let html = template;
  const canonical = SITE.replace(/\/$/, '') + route.url;

  // <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(route.title)}</title>`);

  // Standard + canonical
  html = setMeta(html, 'name', 'description', route.description);
  html = html.replace(
    /(<link\s+rel=["']canonical["']\s+href=["'])[^"']*(["'])/i,
    `$1${esc(canonical)}$2`
  );

  // Open Graph
  html = setMeta(html, 'property', 'og:title', route.title);
  html = setMeta(html, 'property', 'og:description', route.description);
  html = setMeta(html, 'property', 'og:url', canonical);

  // Twitter
  html = setMeta(html, 'name', 'twitter:title', route.title);
  html = setMeta(html, 'name', 'twitter:description', route.description);

  // Crawlable body injected into the (empty) root. React's createRoot replaces
  // this on mount, so it's purely for bots / no-JS clients.
  const body = buildBody(route);
  html = html.replace(/(<div id=["']root["']>)\s*(<\/div>)/i, `$1${body}$2`);

  return html;
}

function buildBody(route) {
  const parts = [];
  parts.push(`<main style="max-width:720px;margin:0 auto;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">`);
  parts.push(`<h1>${esc(route.h1)}</h1>`);
  if (route.lead) parts.push(`<p>${esc(route.lead)}</p>`);
  if (Array.isArray(route.sections) && route.sections.length) {
    for (const s of route.sections) parts.push(`<h2>${esc(s)}</h2>`);
  }
  parts.push(`<p><a href="/">Open PerfinLab</a> — the personal finance app that shows its math.</p>`);
  parts.push(`</main>`);
  return parts.join('');
}

try {
  main();
} catch (e) {
  // Absolute backstop — never break the build.
  console.warn('[prerender] unexpected error, skipping prerender:', e && e.message);
}
process.exit(0);
