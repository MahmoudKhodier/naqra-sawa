# الإعداد · Setup

الخطوات دي بتتعمل مرة واحدة بس. لو بتستخدم Claude Code مع Supabase connector، Claude يقدر يعمل أغلبها بنفسه (شوف `CLAUDE.md`).
You only do this once. With the Supabase connector in Claude Code, Claude can do most of it for you (see `CLAUDE.md`).

---

## 1) Supabase (السيرفر · the server)

1. **مشروع جديد · New project:** على supabase.com اعمل مشروع مجاني. اختار أقرب منطقة ليكم (مثلا Frankfurt لمصر). احفظ باسورد قاعدة البيانات في مكان آمن.
   Create a free project at supabase.com, in the region closest to your readers (e.g. Frankfurt for Egypt).
2. **قاعدة البيانات · Database:** من **SQL Editor** الصق محتوى `supabase/migrations/20261028000000_init.sql` ودوس **Run**.
   In **SQL Editor**, paste `supabase/migrations/20261028000000_init.sql` and run it. It creates the tables, security rules and the `books` / `covers` storage buckets.
3. **إيميل الدخول · Sign-in email:** من **Authentication → Emails**، في قالبي **Magic Link** و **Confirm signup** حط الكود:
   In **Authentication → Emails**, edit both the **Magic Link** and **Confirm signup** templates so they include the code:
   ```html
   <h2>كود الدخول لـ «نقرأ سوا»: {{ .Token }}</h2>
   <p>اكتب الكود ده في التطبيق، أو <a href="{{ .ConfirmationURL }}">ادخل من هنا</a>.</p>
   <p dir="ltr">Your sign-in code: <b>{{ .Token }}</b></p>
   ```
4. **⚠️ إرسال الإيميلات · Email sending:** سيرفر الإيميل المجاني الافتراضي في Supabase بيبعت عدد صغير جدا من الإيميلات في الساعة ومعمول للتجربة بس. عشان صحابك يقدروا يدخلوا، فعّل **Custom SMTP** من **Authentication → Emails → SMTP Settings** بأي خدمة مجانية (مثلا Brevo أو Resend، أو Gmail بـ App Password).
   Supabase's built-in email service only sends a handful of emails per hour and is meant for testing. Turn on **Custom SMTP** (Authentication → Emails → SMTP Settings) with a free provider such as Brevo, Resend or Gmail with an app password, or sign-ins will fail once a few people try.
5. **الروابط · URLs:** من **Authentication → URL Configuration**: خلّي **Site URL** هو رابط التطبيق (مثلا `https://USER.github.io/naqra-sawa/`) وضيف نفس الرابط و `https://localhost` في **Redirect URLs**.
   Set **Site URL** to the app's address and add it plus `https://localhost` (the Android app) to **Redirect URLs**.
6. **المفاتيح · Keys:** من **Project Settings → API** انسخ **Project URL** و **anon public key** وحطهم في `site/config.js`. المفتاح ده معمول عشان يكون عام؛ قواعد الأمان (RLS) هي اللي بتحمي البيانات.
   Copy the **Project URL** and the **anon public key** into `site/config.js`. That key is designed to be public; Row Level Security protects the data.

## 2) GitHub (الاستضافة وملف الأندرويد · hosting and the Android file)

1. ارفع الكود على repo (Claude بيعمل ده).
2. من **Settings → Pages** اختار **Source: GitHub Actions**. بعد كام دقيقة التطبيق هيبقى على `https://USER.github.io/REPO/`.
3. ملف الأندرويد بيتبني لوحده وبيتحط في **Releases → android-latest** باسم `naqra-sawa.apk`. حط رابطه في `apkUrl` في `site/config.js` عشان يظهر في الإعدادات.

## 3) اختياري · Optional

- **بحث الكتب · Book search:** اعمل مفتاح مجاني لـ Google Books API من console.cloud.google.com وحطه في `googleBooksKey`.
- **تذكيرات الويب · Web push reminders** (الأندرويد مش محتاجها، بيفكّر من الموبايل نفسه):
  1. `npx web-push generate-vapid-keys`
  2. انشر الـfunction: `supabase functions deploy notify --no-verify-jwt`
  3. Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:you@example.com`), `NOTIFY_SECRET` (any long random string).
  4. شغّل `supabase/setup/push.sql` في SQL Editor بعد ما تبدّل `<PROJECT_REF>` و `<NOTIFY_SECRET>`.
  5. حط `VAPID_PUBLIC_KEY` في `vapidPublicKey` في `site/config.js`.

## حدود الخطة المجانية · Free plan limits

- تخزين الملفات ١ جيجا (حوالي ٢٠–٥٠ كتاب حسب الحجم). الملف الواحد لحد ٥٠ ميجا، والتطبيق بيقسّم الأكبر أوتوماتيك.
- المشروع المجاني بيقف لو محدش استخدمه أسبوع؛ بيرجع من لوحة التحكم بضغطة.
- 1 GB file storage (≈20–50 books), 50 MB per file (bigger PDFs are split automatically), and free projects pause after a week of inactivity (resume from the dashboard).
