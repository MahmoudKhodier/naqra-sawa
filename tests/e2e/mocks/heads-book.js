/* A small Arabic book (A5, 4 pages) with headings at four levels — فصل / مبحث / مطلب / فرع — made into a PDF
   with Chromium, for the heading mock-ups. make(browser, outPath) writes the PDF and returns where each heading
   and a few body lines sit on their pages (fractions of the page, like a note's rect). */
'use strict';
const fs = require('fs');
const path = require('path');
const FONTS = path.join(__dirname, '..', '..', '..', 'site', 'fonts');

const PAGES = [
  {
    no: 73,
    items: [
      ['h1', 'الفصل الثالث: الخلافة الراشدة'],
      ['p', 'انتقل المسلمون بعد وفاة النبي ﷺ إلى مرحلة جديدة، كان عليهم فيها أن يختاروا من يقوم بأمر الأمة، وأن يحفظوا وحدتها في وقت عصيب.'],
      ['h2', 'المبحث الأول: خلافة أبي بكر الصديق'],
      ['p', 'تولّى أبو بكر الخلافة سنة إحدى عشرة للهجرة، ودامت خلافته نحو سنتين وثلاثة أشهر، واجه فيها أخطارًا كبيرة في الداخل والخارج.'],
      ['h3', 'المطلب الأول: البيعة في سقيفة بني ساعدة'],
      ['p', 'اجتمع الأنصار في السقيفة للتشاور، ثم لحق بهم أبو بكر وعمر وأبو عبيدة، ودار بينهم حوار طويل انتهى ببيعة أبي بكر.'],
      ['h4', 'الفرع الأول: موقف الأنصار'],
      ['p', 'رأى بعض الأنصار أن يكون منهم أمير ومن المهاجرين أمير، ثم اجتمعت الكلمة بعد الحوار على رجل واحد.'],
    ],
  },
  {
    no: 74,
    items: [
      ['h4', 'الفرع الثاني: موقف المهاجرين'],
      ['p', 'ذكّر المهاجرون بسابقتهم في الإسلام وقرابتهم من النبي ﷺ، واحتجّوا بأن العرب لا تجتمع إلا على هذا الحيّ من قريش.'],
      ['p', 'وانتهى الأمر بالبيعة العامة في المسجد في اليوم التالي، وخطب أبو بكر خطبته المشهورة التي رسم فيها منهج حكمه.'],
      ['h3', 'المطلب الثاني: إنفاذ جيش أسامة'],
      ['p', 'أصرّ أبو بكر على إنفاذ الجيش الذي جهّزه النبي ﷺ قبل وفاته بقيادة أسامة بن زيد إلى أطراف الشام، رغم اضطراب الأحوال في الجزيرة.'],
    ],
  },
  {
    no: 75,
    items: [
      ['p', 'وعاد الجيش سالمًا بعد أن أدّى مهمته، فكان لعودته أثر كبير في نفوس القبائل التي ظنّت أن دولة المسلمين قد ضعفت.'],
      ['h2', 'المبحث الثاني: حروب الردة'],
      ['p', 'ارتدّت قبائل كثيرة بعد وفاة النبي ﷺ، ومنع بعضها الزكاة، وادّعى آخرون النبوة، فعقد أبو بكر أحد عشر لواءً لقتالهم.'],
      ['h3', 'المطلب الأول: مانعو الزكاة'],
      ['p', 'رأى أبو بكر أن الزكاة حق المال، وأنه لا يفرّق بين الصلاة والزكاة، فقاتل من منعها حتى عادوا إلى الطاعة.'],
    ],
  },
  {
    no: 76,
    items: [
      ['h3', 'المطلب الثاني: معركة اليمامة'],
      ['p', 'كانت اليمامة أشد معارك الردة، التقى فيها المسلمون بقيادة خالد بن الوليد بجيش مسيلمة سنة اثنتي عشرة للهجرة.'],
      ['h4', 'الفرع الأول: جمع القرآن'],
      ['p', 'استُشهد في اليمامة عدد كبير من حفّاظ القرآن، فأشار عمر على أبي بكر بجمعه، فكلّف زيد بن ثابت بذلك.'],
    ],
  },
];

const css = `
@font-face { font-family: Amiri; font-weight: 400; src: url("file://${FONTS}/amiri-arabic-400-normal.woff2") format("woff2"); }
@font-face { font-family: Amiri; font-weight: 700; src: url("file://${FONTS}/amiri-arabic-700-normal.woff2") format("woff2"); }
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
.page { position: relative; width: 148mm; height: 210mm; padding: 16mm 17mm 14mm; overflow: hidden; direction: rtl; font-family: Amiri, serif; color: #1d1a14; page-break-after: always; break-after: page; }
.rh { position: absolute; top: 8mm; left: 17mm; right: 17mm; text-align: center; font-size: 9pt; color: #777; border-bottom: .6pt solid #999; padding-bottom: 1.5mm; }
.no { position: absolute; bottom: 7mm; left: 0; right: 0; text-align: center; font-size: 10pt; }
h1 { font-size: 18pt; text-align: center; margin: 9mm 0 5mm; font-weight: 700; color: #6b2e12; }
h2 { font-size: 14.5pt; margin: 7mm 0 2.5mm; font-weight: 700; }
h3 { font-size: 12.5pt; margin: 5.5mm 0 2mm; font-weight: 700; }
h4 { font-size: 11.5pt; margin: 4.5mm 0 1.5mm; font-weight: 700; color: #333; }
p { font-size: 11pt; line-height: 1.95; margin: 0 0 2mm; text-align: justify; text-indent: 5mm; }
`;

const html = () => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>${PAGES.map(
  (pg) => `<div class="page"><div class="rh">الخلافة الراشدة — الفصل الثالث</div>${pg.items.map(([t, s]) => `<${t}>${s}</${t}>`).join('')}<div class="no">${String(pg.no).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])}</div></div>`,
).join('')}</body></html>`;

async function make(browser, out) {
  const ctx = await browser.newContext({ viewport: { width: 600, height: 900 } });
  const page = await ctx.newPage();
  const tmp = out.replace(/\.pdf$/, '.html');
  fs.writeFileSync(tmp, html());
  await page.goto('file://' + tmp);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  const marks = await page.evaluate(() => {
    const out = { heads: [], lines: [] };
    const lv = { H1: 1, H2: 2, H3: 3, H4: 4 };
    document.querySelectorAll('.page').forEach((pg, i) => {
      const P = pg.getBoundingClientRect();
      const fr = (r) => ({ x: (r.left - P.left) / P.width, y: (r.top - P.top) / P.height, w: r.width / P.width, h: r.height / P.height });
      pg.querySelectorAll('h1,h2,h3,h4').forEach((h) => {
        const rg = document.createRange();
        rg.selectNodeContents(h);
        out.heads.push(Object.assign({ p: i + 1, l: lv[h.tagName], t: h.textContent }, fr(rg.getBoundingClientRect())));
      });
      pg.querySelectorAll('p').forEach((el, k) => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const rs = [...rg.getClientRects()];
        out.lines.push({ p: i + 1, k, first: fr(rs[0]), second: rs[1] ? fr(rs[1]) : null });
      });
    });
    return out;
  });
  await page.pdf({ path: out, width: '148mm', height: '210mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await ctx.close();
  return marks;
}

module.exports = { make, PAGES };
