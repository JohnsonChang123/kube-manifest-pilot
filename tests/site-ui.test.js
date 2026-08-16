'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sharedPages = [
  'index.html',
  'generator/index.html',
  'templates/index.html',
  'privacy/index.html',
  'licenses/index.html',
  '404.html'
];
const allPages = [...sharedPages, 'designer/index.html'];
const canonicalRoutes = {
  'index.html': '',
  'generator/index.html': 'generator/',
  'templates/index.html': 'templates/',
  'designer/index.html': 'designer/',
  'privacy/index.html': 'privacy/',
  'licenses/index.html': 'licenses/'
};
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function documentMarkup(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

function idsIn(html) {
  return [...documentMarkup(html).matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
}

function assertNoDuplicateIds(relative, html) {
  const ids = idsIn(html);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `${relative} contains duplicate ids`);
}

function assertLabelsResolve(relative, html) {
  const ids = new Set(idsIn(html));
  for (const match of documentMarkup(html).matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) {
    assert(ids.has(match[1]), `${relative} label points to missing #${match[1]}`);
  }
}

function assertLocalResourcesExist(relative, html) {
  const pageDir = path.dirname(path.join(root, relative));
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const reference = match[1];
    if (!reference || reference === '#' || reference.startsWith('#') || /^[a-z]+:/i.test(reference) || reference.startsWith('/')) continue;
    const clean = reference.split(/[?#]/, 1)[0];
    if (!clean) continue;
    const target = path.resolve(pageDir, clean);
    assert(fs.existsSync(target), `${relative} references missing local target ${reference}`);
  }
}

for (const relative of allPages) {
  const html = read(relative);
  assertNoDuplicateIds(relative, html);
  assertLabelsResolve(relative, html);
  assertLocalResourcesExist(relative, html);
}

for (const [relative, route] of Object.entries(canonicalRoutes)) {
  const expected = `https://johnsonchang123.github.io/kube-manifest-pilot/${route}`;
  assert(
    read(relative).includes(`<link rel="canonical" href="${expected}">`),
    `${relative} must use its published canonical URL`
  );
}

for (const relative of sharedPages) {
  const html = read(relative);
  const initPosition = html.indexOf('theme-init.js');
  const cssPosition = html.indexOf('site.css');
  assert(initPosition >= 0, `${relative} must load theme-init.js`);
  assert(cssPosition > initPosition, `${relative} must initialize the theme before CSS`);
  assert(html.includes('data-theme-toggle'), `${relative} must expose a theme toggle`);
  assert(html.includes('site.js'), `${relative} must load shared UI behavior`);
}

const generatorHtml = read('generator/index.html');
for (const match of generatorHtml.matchAll(/<textarea\b[^>]*\bname="([^"]+)"/g)) {
  assert(
    generatorHtml.includes(`data-error-for="${match[1]}"`),
    `generator textarea ${match[1]} must have an error message target`
  );
}
assert(generatorHtml.includes('value="nodeport"'), 'Generator must include NodePort exposure');

const homeHtml = read('index.html');
assert(homeHtml.includes('action="./generator/"'), 'Homepage quick start must submit to generator/');
for (const name of ['template', 'project', 'environment']) {
  assert(homeHtml.includes(`name="${name}"`), `Homepage quick start is missing ${name}`);
}
for (const match of homeHtml.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
  assert.doesNotThrow(() => JSON.parse(match[1]), 'Homepage JSON-LD must be valid JSON');
}

const designerHtml = read('designer/index.html');
assert(designerHtml.includes("kube-manifest-pilot.theme"), 'Designer must share the theme preference key');
assert(designerHtml.includes('@media (max-width: 700px)'), 'Designer must define its mobile drawer layout');
assert(designerHtml.includes('href="../privacy/"'), 'Designer must link to privacy information');
assert(designerHtml.includes('href="../licenses/"'), 'Designer must link to licensing information');
for (const match of designerHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/\bsrc=/i.test(match[1]) || /application\/ld\+json/i.test(match[1])) continue;
  assert.doesNotThrow(() => new Function(match[2]), 'Designer inline JavaScript must parse');
}

const css = read('assets/css/site.css');
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, 'Shared CSS braces must balance');
assert(css.includes(':root[data-theme="dark"]'), 'Shared CSS must define explicit dark variables');
assert(css.includes('@media (max-width: 1240px)'), 'Generator must leave the narrow three-column layout before 1240px');
assert(css.includes('@media (max-width: 620px)'), 'Shared UI must define phone layout rules');
assert(/\.deploy-output\s*{[^}]*overflow:\s*auto/is.test(css), 'Deployment output must scroll instead of clipping');
assert(/\.output-tabs\s*{[^}]*overflow-x:\s*auto/is.test(css), 'Output tabs must remain reachable on phones');

const themeInit = read('assets/js/theme-init.js');
function executeThemeInit({ stored = '', dark = false, storageThrows = false }) {
  const attributes = {};
  const style = {};
  const meta = { setAttribute(name, value) { this[name] = value; } };
  const context = {
    window: {
      localStorage: {
        getItem() {
          if (storageThrows) throw new Error('blocked');
          return stored;
        }
      },
      matchMedia() { return { matches: dark }; }
    },
    document: {
      documentElement: {
        style,
        setAttribute(name, value) { attributes[name] = value; }
      },
      querySelector() { return meta; }
    }
  };
  vm.runInNewContext(themeInit, context);
  return { attributes, style, meta };
}

assert.equal(executeThemeInit({ dark: true }).attributes['data-theme'], 'dark');
assert.equal(executeThemeInit({ stored: 'light', dark: true }).attributes['data-theme'], 'light');
assert.equal(executeThemeInit({ dark: true, storageThrows: true }).attributes['data-theme'], 'dark');

const sitemap = read('sitemap.xml');
for (const route of ['', 'generator/', 'templates/', 'designer/', 'privacy/', 'licenses/']) {
  assert(
    sitemap.includes(`https://johnsonchang123.github.io/kube-manifest-pilot/${route}`),
    `sitemap.xml is missing ${route || 'home'}`
  );
}

console.log('site-ui: all tests passed');
