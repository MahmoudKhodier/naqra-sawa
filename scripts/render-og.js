#!/usr/bin/env node
/* The picture WhatsApp, Telegram and others show when someone shares a link to the app (og:image),
   1200×630. The output (site/icons/og.png) is committed; run this only when the art changes.

   Needs Playwright with Chromium on the machine (not a project dependency):
     node scripts/render-og.js */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'icons', 'og.png');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts/fonts.css">
<style>
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; display: grid; place-items: center; background: radial-gradient(circle at 85% 10%, #f6d77a55, transparent 55%), radial-gradient(circle at 10% 95%, #3a5cc833, transparent 50%), #fdf6e3; font-family: 'Readex Pro', sans-serif; color: #1d1a14; }
  .frame { position: absolute; inset: 28px; border: 3px solid #1d1a1418; border-radius: 40px; }
  .wrap { display: flex; align-items: center; gap: 64px; }
  .tile { width: 260px; height: 260px; border-radius: 60px; background: #2441a3; display: grid; place-items: center; box-shadow: 0 24px 60px #17327a44; }
  .tile img { width: 260px; height: 260px; border-radius: 60px; }
  h1 { font-size: 104px; margin: 0; line-height: 1.1; }
  p { font-size: 36px; margin: 18px 0 0; color: #6b6352; max-width: 720px; line-height: 1.45; }
  .tag { display: inline-block; margin-top: 30px; padding: 12px 30px; border-radius: 99px; background: #e0a526; color: #2a1a00; font-size: 34px; font-weight: 700; }
</style></head><body><div class="frame"></div>
<div class="wrap"><div class="tile"><img src="icons/icon-512.png" alt=""></div>
<div><h1>نقرأ سوا</h1><p>حلقة قراية لصحابك وعيلتك: كتاب واحد، ورد كل يوم، ونقاش على الصفحات</p><span class="tag">تعالى اقرأ معانا 📚</span></div></div>
</body></html>`;

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  // load from the site folder so the fonts and the icon resolve
  const fs = require('fs');
  const tmp = path.join(ROOT, 'site', '.og-render.html');
  fs.writeFileSync(tmp, html);
  try {
    await page.goto('file://' + tmp);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT });
  } finally {
    fs.unlinkSync(tmp);
    await browser.close();
  }
  console.log('wrote', path.relative(ROOT, OUT));
})();
