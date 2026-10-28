#!/usr/bin/env node
/* Draws the نقرأ سوا app icon (lapis tile, gold rub el hizb star, open book) and renders every
   size the PWA and the Android shell need. The output is committed, so this only runs when the art changes.

   Needs Playwright with Chromium on the machine (it is NOT a project dependency):
     node scripts/render-icons.js            -> site/icons/* and android/app/src/main/res/*
     node scripts/render-icons.js --preview  -> writes a contact sheet to $PREVIEW (default: icons-preview.png) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ICONS = path.join(ROOT, 'site', 'icons');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const C = {
  lapis: '#2441a3',
  lapisD: '#172e7a',
  lapisGlow: '#3a5cc8',
  gold: '#e0a526',
  goldHi: '#f6d77a',
  goldD: '#a8790c',
  cream: '#fdf6e3',
  ink: '#0f2163',
};

const f = (n) => +n.toFixed(2);
const SQRT2 = Math.SQRT2;

/* Rub el hizb: the union of two squares, one turned 45°. Outer points sit on radius R, the 8 inner corners on R·√(2−√2). */
function starPoints(cx, cy, R) {
  const r = R * Math.sqrt(2 - SQRT2);
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 8;
    const rad = k % 2 ? r : R;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
const starPath = (cx, cy, R) => poly(starPoints(cx, cy, R));

/* Open book, drawn in a 200×120 box centred on (0,0) and scaled so its half-width is w. */
const BOOK_PAGES = [
  'M-5 -32C-28 -50 -64 -55 -100 -45L-100 45C-64 37 -28 40 -5 56Z',
  'M5 -32C28 -50 64 -55 100 -45L100 45C64 37 28 40 5 56Z',
];
const BOOK_BASE = 'M-100 55C-64 47 -28 50 0 68C28 50 64 47 100 55';
function bookPaths(cx, cy, w) {
  const s = w / 100;
  const tf = (d) =>
    d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(cx + x * s)} ${f(cy + (y - 6) * s)}`);
  return { pages: BOOK_PAGES.map(tf), base: tf(BOOK_BASE), stroke: 9 * s };
}

/* Full-colour art. bg: 'rounded' | 'square' | 'circle' | 'none'; scale = star radius / size. */
function iconSVG({ size = 512, bg = 'rounded', scale = 0.37, radius = 0.215 }) {
  const c = size / 2;
  const R = size * scale;
  const h = R / SQRT2;
  const book = bookPaths(c, c, h * 0.68);
  const lw = Math.max(R * 0.028, 0.6);
  let back = '';
  if (bg === 'rounded') back = `<rect width="${size}" height="${size}" rx="${f(size * radius)}" fill="url(#bg)"/>`;
  if (bg === 'square') back = `<rect width="${size}" height="${size}" fill="url(#bg)"/>`;
  if (bg === 'circle') back = `<circle cx="${c}" cy="${c}" r="${c}" fill="url(#bg)"/>`;
  const glow = bg === 'none' ? '' : `<circle cx="${c}" cy="${f(c * 0.96)}" r="${f(R * 1.25)}" fill="url(#glow)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.lapis}"/><stop offset="1" stop-color="${C.lapisD}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${C.lapisGlow}" stop-opacity=".55"/><stop offset="1" stop-color="${C.lapisGlow}" stop-opacity="0"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${C.goldHi}"/><stop offset=".55" stop-color="${C.gold}"/><stop offset="1" stop-color="#d0911a"/></linearGradient>
<linearGradient id="book" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.lapis}"/><stop offset="1" stop-color="${C.lapisD}"/></linearGradient>
</defs>
${back}${glow}
<path d="${starPath(c, c, R)}" fill="url(#gold)"/>
<path d="${starPath(c, c, R)}" fill="none" stroke="${C.goldD}" stroke-opacity=".5" stroke-width="${f(lw)}" stroke-linejoin="round"/>
<path d="${starPath(c, c, R * 0.87)}" fill="none" stroke="${C.goldD}" stroke-opacity=".38" stroke-width="${f(lw)}" stroke-linejoin="round"/>
<path d="${book.base}" fill="none" stroke="${C.lapisD}" stroke-width="${f(book.stroke)}" stroke-linecap="round" stroke-linejoin="round"/>
${book.pages.map((d) => `<path d="${d}" fill="url(#book)"/>`).join('')}
</svg>`;
}

/* One-colour silhouette (star with the book cut out) for the push badge and Android monochrome/notification icons. */
function monoPath(size, scale) {
  const c = size / 2;
  const R = size * scale;
  const book = bookPaths(c, c, (R / SQRT2) * 0.68);
  return { star: starPath(c, c, R), pages: book.pages };
}
function monoSVG({ size = 96, scale = 0.46, color = '#ffffff' }) {
  const m = monoPath(size, scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><path fill="${color}" fill-rule="evenodd" d="${m.star}${m.pages.join('')}"/></svg>`;
}
function vectorDrawable({ dp, scale, color = '#FFFFFFFF' }) {
  const m = monoPath(dp, scale);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/render-icons.js: rub el hizb star with the open book cut out. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${dp}dp"
    android:height="${dp}dp"
    android:viewportWidth="${dp}"
    android:viewportHeight="${dp}">
    <path
        android:fillColor="${color}"
        android:fillType="evenOdd"
        android:pathData="${m.star} ${m.pages.join(' ')}" />
</vector>
`;
}

/* Splash mark: the star plus the app name, on a transparent canvas (220×210 dp). */
function splashMarkSVG(fontDataUrl) {
  const W = 220;
  const H = 210;
  const R = 64;
  const cx = W / 2;
  const cy = 76;
  const h = R / SQRT2;
  const book = bookPaths(cx, cy, h * 0.68);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<style>@font-face{font-family:'El Messiri';font-weight:700;src:url(${fontDataUrl}) format('woff2');}</style>
<linearGradient id="gold" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${C.goldHi}"/><stop offset=".55" stop-color="${C.gold}"/><stop offset="1" stop-color="#d0911a"/></linearGradient>
<linearGradient id="book" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.lapis}"/><stop offset="1" stop-color="${C.lapisD}"/></linearGradient>
</defs>
<path d="${starPath(cx, cy, R)}" fill="url(#gold)"/>
<g fill="none" stroke="${C.goldD}" stroke-width="1.8" stroke-linejoin="round"><path stroke-opacity=".5" d="${starPath(cx, cy, R)}"/><path stroke-opacity=".38" d="${starPath(cx, cy, R * 0.87)}"/></g>
<path d="${book.base}" fill="none" stroke="${C.lapisD}" stroke-width="${f(book.stroke)}" stroke-linecap="round" stroke-linejoin="round"/>
${book.pages.map((d) => `<path d="${d}" fill="url(#book)"/>`).join('')}
<text x="${cx}" y="${H - 18}" text-anchor="middle" direction="rtl" font-family="El Messiri" font-weight="700" font-size="38" word-spacing="10" fill="${C.cream}">نقرأ سوا</text>
</svg>`;
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/* Optional: if sharp is resolvable (e.g. NODE_PATH=/path/to/node_modules) the PNGs are palette-quantised, ~3× smaller. */
let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {}

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('render-icons needs Playwright + Chromium (not a project dependency). Install it globally or run with NODE_PATH pointing at a node_modules that has it.');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  /* Render an SVG string (drawn at its own viewBox size) to a PNG of size w×h. */
  async function png(svg, w, h, out, { opaque = false } = {}) {
    const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${opaque ? '#172e7a' : 'transparent'}}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`;
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    let buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: !opaque, type: 'png' });
    if (sharp) buf = await sharp(buf).png({ compressionLevel: 9, palette: true, quality: 100, effort: 10, dither: 1 }).toBuffer();
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
    }
    return buf;
  }

  if (process.argv.includes('--preview')) {
    const sizes = [512, 192, 96, 48, 32, 16];
    const cells = [];
    for (const s of sizes) {
      const b = await png(iconSVG({ size: 512, bg: 'rounded', scale: s <= 32 ? 0.4 : 0.37 }), s, s);
      cells.push(`<img src="data:image/png;base64,${b.toString('base64')}" width="${s}" height="${s}">`);
    }
    const m = await png(iconSVG({ size: 512, bg: 'square', scale: 0.32 }), 192, 192);
    const mono = await png(monoSVG({ size: 96, scale: 0.46, color: '#ffffff' }), 96, 96);
    await page.setViewportSize({ width: 1100, height: 560 });
    await page.setContent(
      `<body style="margin:0;padding:16px;background:#f1f3f9;display:flex;gap:16px;align-items:end;flex-wrap:wrap">${cells.join('')}` +
        `<img style="border-radius:50%" src="data:image/png;base64,${m.toString('base64')}"><span style="background:#333;padding:6px"><img src="data:image/png;base64,${mono.toString('base64')}"></span></body>`
    );
    await page.screenshot({ path: process.env.PREVIEW || 'icons-preview.png', fullPage: true });
    await browser.close();
    return;
  }

  /* ---------- PWA icons (site/icons) ---------- */
  fs.mkdirSync(ICONS, { recursive: true });
  const favicon = iconSVG({ size: 512, bg: 'rounded', scale: 0.4, radius: 0.19 });
  fs.writeFileSync(path.join(ICONS, 'favicon.svg'), favicon.replace(/\n/g, '') + '\n');
  await png(favicon, 32, 32, path.join(ICONS, 'favicon-32.png'));
  await png(iconSVG({ size: 512, bg: 'square', scale: 0.35 }), 180, 180, path.join(ICONS, 'apple-touch-icon.png'), { opaque: true });
  await png(iconSVG({ size: 512, bg: 'rounded', scale: 0.37 }), 192, 192, path.join(ICONS, 'icon-192.png'));
  await png(iconSVG({ size: 512, bg: 'rounded', scale: 0.37 }), 512, 512, path.join(ICONS, 'icon-512.png'));
  await png(iconSVG({ size: 512, bg: 'square', scale: 0.32 }), 512, 512, path.join(ICONS, 'maskable-512.png'), { opaque: true });
  await png(monoSVG({ size: 96, scale: 0.46 }), 96, 96, path.join(ICONS, 'badge-96.png'));

  /* ---------- Android launcher icons, adaptive icon, splash, notification icon ---------- */
  if (fs.existsSync(RES)) {
    for (const [d, k] of Object.entries(DENSITIES)) {
      const dir = path.join(RES, `mipmap-${d}`);
      await png(iconSVG({ size: 512, bg: 'rounded', scale: 0.37, radius: 0.2 }), 48 * k, 48 * k, path.join(dir, 'ic_launcher.png'));
      await png(iconSVG({ size: 512, bg: 'circle', scale: 0.35 }), 48 * k, 48 * k, path.join(dir, 'ic_launcher_round.png'));
      await png(iconSVG({ size: 512, bg: 'none', scale: 0.26 }), 108 * k, 108 * k, path.join(dir, 'ic_launcher_foreground.png'));
    }
    const fontFile = path.join(ROOT, 'site', 'fonts', 'el-messiri-arabic-700-normal.woff2');
    const fontUrl = 'data:font/woff2;base64,' + fs.readFileSync(fontFile).toString('base64');
    const mark = splashMarkSVG(fontUrl);
    for (const [d, k] of Object.entries(DENSITIES)) {
      await png(mark, 220 * k, 210 * k, path.join(RES, `drawable-${d}`, 'splash_mark.png'));
    }
    fs.writeFileSync(path.join(RES, 'drawable', 'ic_stat_naqra.xml'), vectorDrawable({ dp: 24, scale: 0.45 }));
    fs.writeFileSync(path.join(RES, 'drawable', 'ic_launcher_monochrome.xml'), vectorDrawable({ dp: 108, scale: 0.26, color: '#FF000000' }));
  }

  await browser.close();
  console.log('icons: rendered site/icons/*' + (fs.existsSync(RES) ? ' and android/app/src/main/res/*' : '') + (sharp ? ' (optimised with sharp)' : ''));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
