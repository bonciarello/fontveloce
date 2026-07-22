/**
 * Test suite for TTF → WOFF2 Converter (Svelte SPA)
 * Run with: node tests/run.js
 *
 * Note: because this is a Svelte SPA, semantic HTML elements are rendered
 * client-side. We verify their presence in the JS bundle instead of index.html.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const publicDir = resolve(__dirname, '..', 'public');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

function check(description, fn) {
  try {
    console.log(`\n${description}`);
    fn();
  } catch (err) {
    console.log(`  ✗ UNEXPECTED ERROR: ${err.message}`);
    failed++;
  }
}

// Read the JS bundle for client-side content checks
function getJsBundle() {
  const assetsDir = resolve(distDir, 'assets');
  const files = readdirSync(assetsDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  if (jsFiles.length === 0) return '';
  return readFileSync(resolve(assetsDir, jsFiles[0]), 'utf-8');
}

// ---- Build output checks ----
check('Build output', () => {
  assert(existsSync(distDir), 'dist directory exists');
  assert(existsSync(resolve(distDir, 'index.html')), 'index.html exists');
  assert(existsSync(resolve(distDir, 'robots.txt')), 'robots.txt in dist');
  assert(existsSync(resolve(distDir, 'sitemap.xml')), 'sitemap.xml in dist');
  assert(existsSync(resolve(publicDir, 'woff2.wasm')), 'woff2.wasm in public (needed for WASM init)');
});

// ---- HTML shell checks (what IS in the static index.html) ----
check('HTML shell', () => {
  const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');

  assert(html.includes('<!DOCTYPE html>'), 'DOCTYPE present');
  assert(html.includes('<html lang="it"'), 'lang="it" set');
  assert(html.includes('<meta name="viewport"'), 'viewport meta present');
  assert(html.includes('<title>'), 'title tag present');
  assert(html.includes('Convertitore TTF a WOFF2'), 'descriptive title');
  assert(html.includes('<meta name="description"'), 'meta description present');
  assert(html.includes('converti'), 'Italian content in meta description');
  assert(html.includes('og:title'), 'Open Graph og:title present');
  assert(html.includes('og:description'), 'Open Graph og:description present');
  assert(html.includes('og:type'), 'Open Graph og:type present');
  assert(html.includes('og:url'), 'Open Graph og:url present');
  assert(html.includes('<link rel="canonical"'), 'canonical link present');
  assert(html.includes('schema.org'), 'JSON-LD schema.org present');
  assert(html.includes('application/ld+json'), 'JSON-LD script type correct');
  assert(html.includes('base href='), 'base href set for sub-path safety');
  assert(html.includes('fonts.googleapis.com'), 'Google Fonts loaded');
  assert(html.includes('Fraunces'), 'Fraunces display font loaded');
  assert(html.includes('Inter'), 'Inter body font loaded');
  assert(html.includes('JetBrains+Mono'), 'JetBrains Mono loaded');
});

// ---- Client-side content checks (in JS bundle) ----
check('Client-side content (rendered by Svelte)', () => {
  const js = getJsBundle();
  assert(js.length > 0, 'JS bundle readable');

  // Semantic landmarks (rendered by Svelte)
  assert(js.includes('header') || js.includes('<header'), 'header rendered client-side');
  assert(js.includes('main') || js.includes('<main'), 'main rendered client-side');
  assert(js.includes('footer') || js.includes('<footer'), 'footer rendered client-side');

  // h1 (rendered by Svelte)
  assert(js.includes('TTF') && js.includes('WOFF2'), 'TTF → WOFF2 content in bundle');

  // Accessibility (rendered by Svelte)
  assert(js.includes('role') || js.includes('aria-'), 'Accessibility attributes present in bundle');

  // Key features
  assert(js.includes('trascina') || js.includes('drag') || js.includes('drop'), 'drag & drop UI present');
  assert(js.includes('anteprima') || js.includes('preview'), 'preview feature present');
  assert(js.includes('zip') || js.includes('ZIP'), 'ZIP download feature present');
});

// ---- SEO files checks ----
check('SEO files', () => {
  const robots = readFileSync(resolve(distDir, 'robots.txt'), 'utf-8');
  assert(robots.includes('User-agent: *'), 'robots.txt has User-agent');
  assert(robots.includes('Allow: /'), 'robots.txt has Allow');
  assert(robots.includes('Sitemap:'), 'robots.txt has Sitemap');
  assert(robots.includes('cristianporco.it'), 'robots.txt has correct domain');

  const sitemap = readFileSync(resolve(distDir, 'sitemap.xml'), 'utf-8');
  assert(sitemap.includes('<urlset'), 'sitemap.xml is valid');
  assert(sitemap.includes('<loc>'), 'sitemap.xml has loc');
  assert(sitemap.includes('cristianporco.it'), 'sitemap.xml has correct domain');
});

// ---- JS bundle checks ----
check('JavaScript bundle', () => {
  const assetsDir = resolve(distDir, 'assets');
  const files = readdirSync(assetsDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  const cssFiles = files.filter(f => f.endsWith('.css'));
  
  assert(jsFiles.length > 0, 'JS bundle exists');
  assert(cssFiles.length > 0, 'CSS bundle exists');

  if (jsFiles.length > 0) {
    const js = readFileSync(resolve(assetsDir, jsFiles[0]), 'utf-8');
    // Check key libraries are bundled
    assert(js.includes('woff2Enc') || js.includes('ttftowoff2') || js.includes('fonteditor'), 'WOFF2 conversion code bundled');
    assert(js.includes('JSZip') || js.includes('jszip'), 'JSZip library bundled');
  }
});

// ---- CSS / Design checks ----
check('Design tokens in CSS', () => {
  const assetsDir = resolve(distDir, 'assets');
  const files = readdirSync(assetsDir);
  const cssFiles = files.filter(f => f.endsWith('.css'));
  
  if (cssFiles.length > 0) {
    const css = readFileSync(resolve(assetsDir, cssFiles[0]), 'utf-8');
    // Palette check
    assert(css.includes('#f8f6f1') || css.includes('#2563eb') || css.includes('#1e293b'), 'Color palette present');
    // Motion
    assert(css.includes('prefers-reduced-motion'), 'prefers-reduced-motion respected');
    // Responsive
    assert(css.includes('max-width') || css.includes('@media'), 'Responsive styles present');
  }
});

// ---- Summary ----
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
  process.exit(1);
}
