/* Book lookup: Google Books + Open Library, Arabic results first.
   Used when adding books to the shelf, suggesting a book, or adding a PDF. */
(function () {
  'use strict';
  const A = window.A;
  const U = A.U;
  const L = A.L;
  const V = A.V;
  const esc = U.esc;
  const icon = U.icon;
  const B = (A.B = {});
  const cfg = window.QS_CONFIG || {};

  const httpsify = (u) => (u ? String(u).replace(/^http:\/\//, 'https://') : '');
  const norm = (s) =>
    String(s || '')
      .normalize('NFKC')
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();

  async function google(q, lang) {
    const p = new URLSearchParams({ q, maxResults: '12', printType: 'books', orderBy: 'relevance' });
    if (lang) p.set('langRestrict', lang);
    if (cfg.googleBooksKey) p.set('key', cfg.googleBooksKey);
    const r = await fetch('https://www.googleapis.com/books/v1/volumes?' + p);
    if (!r.ok) throw new Error('google ' + r.status);
    const d = await r.json();
    return (d.items || []).map((it) => {
      const v = it.volumeInfo || {};
      const img = v.imageLinks || {};
      const isbn = (v.industryIdentifiers || []).find((x) => /ISBN_13|ISBN_10/.test(x.type));
      return {
        src: 'google',
        title: [v.title, v.subtitle].filter(Boolean).join(': '),
        author: (v.authors || []).join('، '),
        publisher: v.publisher || '',
        year: (v.publishedDate || '').slice(0, 4),
        pages: v.pageCount || 0,
        lang: v.language || '',
        cover: httpsify(img.thumbnail || img.smallThumbnail || '').replace('&edge=curl', ''),
        isbn: isbn ? isbn.identifier : '',
        desc: v.description || '',
      };
    });
  }
  async function openLibrary(q) {
    const p = new URLSearchParams({ q, limit: '10', fields: 'title,author_name,cover_i,first_publish_year,number_of_pages_median,language,isbn,publisher' });
    const r = await fetch('https://openlibrary.org/search.json?' + p);
    if (!r.ok) throw new Error('openlibrary ' + r.status);
    const d = await r.json();
    return (d.docs || []).map((x) => ({
      src: 'openlibrary',
      title: x.title || '',
      author: (x.author_name || []).slice(0, 3).join('، '),
      publisher: (x.publisher || [])[0] || '',
      year: x.first_publish_year ? String(x.first_publish_year) : '',
      pages: x.number_of_pages_median || 0,
      lang: (x.language || []).includes('ara') ? 'ar' : (x.language || [])[0] || '',
      cover: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-M.jpg` : '',
      isbn: (x.isbn || [])[0] || '',
      desc: '',
    }));
  }

  /* Search both sources; Arabic-language and covered results first; drop near-duplicates. */
  B.search = async (q) => {
    q = String(q || '').trim();
    if (q.length < 2) return [];
    const ar = U.isArabic(q);
    const jobs = [google(q, ar ? 'ar' : ''), openLibrary(q)];
    if (ar) jobs.push(google(q, ''));
    const res = await Promise.allSettled(jobs);
    const all = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (!all.length && res.every((r) => r.status === 'rejected')) throw new Error('offline');
    const seen = new Map();
    const nq = norm(q);
    for (const b of all) {
      if (!b.title) continue;
      const key = norm(b.title) + '|' + norm(b.author).split(' ')[0];
      const prev = seen.get(key);
      if (!prev || (!prev.cover && b.cover) || (!prev.pages && b.pages)) seen.set(key, Object.assign({}, prev || {}, b, { cover: (prev && prev.cover) || b.cover, pages: (prev && prev.pages) || b.pages }));
    }
    const score = (b) => (b.lang === 'ar' ? 4 : 0) + (b.cover ? 2 : 0) + (norm(b.title).includes(nq) ? 3 : 0) + (b.author ? 1 : 0);
    return [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 14);
  };

  /* A search box that fills a form when a result is picked. onPick(book) */
  B.box = (id) => `<div class="bsearch" id="${id}">
      <label class="lbl" for="${id}-q">${icon('globe')}${L('دوّر على الكتاب (العنوان أو المؤلف أو ISBN)', 'Look the book up (title, author or ISBN)', 'ابحث عن الكتاب (العنوان أو المؤلف أو ISBN)')}</label>
      <div class="bs-row"><input id="${id}-q" type="search" dir="auto" autocomplete="off" placeholder="${L('مثلا: رياض الصالحين', 'e.g. The Sealed Nectar', 'مثلًا: رياض الصالحين')}"><button type="button" class="btn sm" data-bs-go>${L('دوّر', 'Search', 'ابحث')}</button></div>
      <div class="bs-res" id="${id}-res" aria-live="polite"></div>
    </div>`;
  B.bind = (root, id, onPick) => {
    const wrap = root.querySelector('#' + id);
    if (!wrap) return;
    const input = wrap.querySelector('#' + id + '-q');
    const out = wrap.querySelector('#' + id + '-res');
    let results = [];
    let n = 0;
    const run = async () => {
      const q = input.value.trim();
      if (q.length < 2) return;
      const my = ++n;
      out.innerHTML = `<p class="muted sm">${L('بدوّر…', 'Searching…', 'جارٍ البحث…')}</p>`;
      try {
        results = await B.search(q);
        if (my !== n) return;
        out.innerHTML = results.length
          ? results
              .map(
                (b, i) => `<button type="button" class="bs-it" data-i="${i}">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : V.genCover(b.title, b.author, 'xs')}<span><b dir="auto">${esc(b.title)}</b><small dir="auto">${esc([b.author, b.publisher, b.year].filter(Boolean).join(' • '))}${b.pages ? ` • ${L.count(b.pages, 'page')}` : ''}</small></span></button>`
              )
              .join('')
          : `<p class="muted sm">${L('ملقيتش حاجة. اكتب البيانات بإيدك، وممكن تصوّر الغلاف.', 'Nothing found. Type the details yourself — you can photograph the cover too.', 'لا توجد نتائج. اكتب البيانات بنفسك، ويمكنك تصوير الغلاف.')}</p>`;
      } catch (e) {
        out.innerHTML = `<p class="muted sm">${L('البحث مش متاح دلوقتي. اتأكد من النت.', 'Search is unavailable right now. Check your connection.', 'البحث غير متاح الآن. تحقّق من اتصالك بالإنترنت.')}</p>`;
      }
    };
    const deb = U.debounce(run, 500);
    input.addEventListener('input', deb);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-bs-go]')) run();
      const it = e.target.closest('[data-i]');
      if (it) {
        const b = results[+it.dataset.i];
        out.innerHTML = '';
        input.value = '';
        onPick(b);
      }
    });
  };

  /* Cover from the phone camera or gallery → small JPEG data URL (kept tiny for the database). */
  B.coverFromFile = (file) =>
    new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 360 / img.width, 540 / img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = 0.78, out = c.toDataURL('image/jpeg', q);
        while (out.length > 60000 && q > 0.35) out = c.toDataURL('image/jpeg', (q -= 0.1));
        c.toBlob((blob) => res({ blob, dataUrl: out }), 'image/jpeg', q);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error('image'));
      };
      img.src = url;
    });

  /* Cover field: preview + "photograph the cover" + remove. State lives in data-cover on the wrapper. */
  B.coverField = (id, cover, title) => `<div class="cover-field" id="${id}" data-cover="${esc(cover || '')}">
      <span class="cf-prev">${V.coverOf({ cover, title: title || '' }, 'sm')}</span>
      <div class="cf-acts"><label class="btn ghost sm">${icon('upload')}${L('صوّر الغلاف أو اختار صورة', 'Photograph or pick a cover', 'صوِّر الغلاف أو اختر صورة')}<input type="file" accept="image/*" capture="environment" hidden data-cf-file></label>
      <button type="button" class="lnk sm" data-cf-clear ${cover ? '' : 'hidden'}>${L('شيل الغلاف', 'Remove cover', 'أزِل الغلاف')}</button></div>
    </div>`;
  B.setCover = (root, id, cover, title) => {
    const w = root.querySelector('#' + id);
    if (!w) return;
    w.dataset.cover = cover || '';
    w.querySelector('.cf-prev').innerHTML = V.coverOf({ cover, title: title || '' }, 'sm');
    w.querySelector('[data-cf-clear]').hidden = !cover;
  };
  B.bindCover = (root, id, getTitle) => {
    const w = root.querySelector('#' + id);
    if (!w) return;
    w.addEventListener('change', async (e) => {
      const f = e.target.closest('[data-cf-file]');
      if (!f || !f.files[0]) return;
      try {
        const { blob, dataUrl } = await B.coverFromFile(f.files[0]);
        B.setCover(root, id, dataUrl, getTitle());
        if (A.P && A.P.uploadCover) {
          w.classList.add('busy');
          const url = await A.P.uploadCover(blob);
          B.setCover(root, id, url, getTitle());
          w.classList.remove('busy');
        }
      } catch (er) {
        w.classList.remove('busy');
        U.toast(L('مقدرتش أرفع الصورة', "Couldn't upload the picture", 'تعذّر رفع الصورة'), 'warn');
      }
    });
    w.addEventListener('click', (e) => {
      if (e.target.closest('[data-cf-clear]')) B.setCover(root, id, '', getTitle());
    });
  };
  B.coverValue = (root, id) => {
    const w = root.querySelector('#' + id);
    return w ? w.dataset.cover || '' : '';
  };

  /* Cover image or the generated design, with a graceful fallback if the remote image fails. */
  V.coverOf = (it, cls = '') => {
    if (it && it.cover) {
      const [bg, fg] = U.spineOf(it.title);
      return `<span class="cover ${cls}" style="--bg:${bg};--fg:${fg}"><img src="${esc(it.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('gen','broken');this.remove()"></span>`;
    }
    return V.genCover(it ? it.title : '', it ? it.author : '', cls);
  };
})();
