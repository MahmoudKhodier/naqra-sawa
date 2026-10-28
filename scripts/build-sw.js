#!/usr/bin/env node
/* Writes the precache list and a content-hash VERSION into site/sw.js.

   Every file under site/ is precached except the worker itself, dotfiles, source maps, docs/licences and
   *.src.* sources. Each entry carries a short content hash (used as a cache-busting query while precaching),
   and VERSION hashes all of them plus the worker's own code, so the cache name changes whenever anything ships.

   Usage: node scripts/build-sw.js           rewrite site/sw.js (idempotent)
          node scripts/build-sw.js --check   exit 1 if site/sw.js is out of date (no write) */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const SW = path.join(SITE, 'sw.js');
const START = '// <precache>';
const END = '// </precache>';
const MAX_BYTES = 8 * 1024 * 1024; // anything bigger is left to the network
const EXPECTED = ['index.html', 'config.js', 'manifest.webmanifest'];

const excluded = (rel) =>
  rel === 'sw.js' ||
  rel.split('/').some((seg) => seg.startsWith('.')) ||
  /\.(map|md|txt|ts)$/i.test(rel) ||
  /(^|\/)(LICENSE|README)[^/]*$/i.test(rel) ||
  /\.src\.[^/]+$/i.test(rel);

function walk(dir, base = '') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walk(path.join(dir, ent.name), rel));
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

const hash = (buf, n) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, n);
const order = (a, b) => {
  // index.html first (it is what offline needs most), then alphabetical
  if (a === 'index.html') return -1;
  if (b === 'index.html') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

const src = fs.readFileSync(SW, 'utf8');
const i = src.indexOf(START);
const j = src.indexOf(END);
if (i < 0 || j < i) throw new Error(`site/sw.js must contain the "${START}" … "${END}" block`);
const lineEnd = src.indexOf('\n', i);
const before = src.slice(0, lineEnd + 1);
const after = src.slice(j);

const entries = [];
const skipped = [];
for (const rel of walk(SITE).sort(order)) {
  if (excluded(rel)) continue;
  const buf = fs.readFileSync(path.join(SITE, rel));
  if (buf.length > MAX_BYTES) {
    skipped.push(`${rel} (${(buf.length / 1048576).toFixed(1)} MiB)`);
    continue;
  }
  entries.push({ rel, rev: hash(buf, 10), size: buf.length });
}

for (const f of EXPECTED) if (!entries.some((e) => e.rel === f)) console.warn(`build-sw: warning: site/${f} not found, so it is not precached`);
for (const s of skipped) console.warn(`build-sw: warning: ${s} is larger than ${MAX_BYTES / 1048576} MiB and is not precached`);

// The version covers every shipped file and the worker's own logic (not the generated block itself).
const version = hash(entries.map((e) => `${e.rel}:${e.rev}`).join('\n') + '\n' + before + after, 12);
const encode = (rel) => rel.split('/').map(encodeURIComponent).join('/');
const block =
  `const VERSION = '${version}';\n` +
  'const PRECACHE = [\n' +
  entries.map((e) => `  ['${encode(e.rel)}', '${e.rev}'],\n`).join('') +
  '];\n';
const next = before + block + after;

if (process.argv.includes('--check')) {
  if (next !== src) {
    console.error('build-sw: site/sw.js is out of date; run "npm run build:sw"');
    process.exit(1);
  }
  console.log(`build-sw: site/sw.js is up to date (version ${version})`);
} else {
  if (next !== src) fs.writeFileSync(SW, next);
  const kib = entries.reduce((n, e) => n + e.size, 0) / 1024;
  console.log(`build-sw: version ${version}, ${entries.length} files precached (${kib.toFixed(0)} KiB)${next === src ? ', unchanged' : ''}`);
}
