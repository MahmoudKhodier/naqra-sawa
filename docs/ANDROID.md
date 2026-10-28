# تطبيق أندرويد — Android app

**رابط التحميل الثابت / Permanent download link**

```
https://github.com/<owner>/<repo>/releases/download/android-latest/naqra-sawa.apk
```

كل ما حد يعمل push على `main` وفيه تغيير في `site/` أو `android/`، GitHub Actions بيبني نسخة جديدة ويحطها على نفس الرابط ده.
Every push to `main` that touches `site/`, `android/`, `capacitor.config.json` or `package*.json` rebuilds the APK (workflow `android`) and replaces the file at that same link.

---

## ١. التثبيت — Installing

1. افتح الرابط من الموبايل ونزّل `naqra-sawa.apk`.
2. افتح الملف. لو ظهرت رسالة «لأسباب أمنية…»، اضغط **الإعدادات** وفعّل **السماح من هذا المصدر** (للمتصفح أو مدير الملفات اللي فتحت منه)، وارجع اضغط **تثبيت**.
3. لو Play Protect قال إن التطبيق مش معروف: **مزيد من التفاصيل ← التثبيت على أي حال**. ده طبيعي لأي تطبيق مش من المتجر.

1. Open the link on the phone and download `naqra-sawa.apk`.
2. Open it. If Android blocks it, tap **Settings** and enable **Allow from this source** for the browser / file manager, then **Install**.
3. If Play Protect warns about an unknown app: **More details → Install anyway** (normal for apps outside the Play Store).

## ٢. التحديث — Updating

مفيش تحديث تلقائي: نزّل نفس الرابط تاني وثبّته فوق القديم، وبياناتك بتفضل زي ما هي.
There is no auto-update: download the same link again and install it over the old one; data is kept.

لو ظهر «لم يتم تثبيت التطبيق» أو «يتعارض مع حزمة موجودة»: معناه إن مفتاح التوقيع اتغيّر (مثلاً أول مرة بعد إضافة مفتاح الإصدار). امسح التطبيق القديم وثبّت الجديد؛ الكتب والحلقات محفوظة على الخادم.
If Android says "App not installed" / "conflicts with an existing package", the signing key changed (e.g. the first build after adding the release keystore). Uninstall the old app once and install the new one; circles and books live on the server.

Each build's `versionCode` is the workflow run number, so a newer APK always installs as an update.

## ٣. مفتاح توقيع الإصدار — Adding a release keystore (do this once, early)

بدون المفتاح، الـ workflow بيطلع نسخة **debug** متوقّعة بمفتاح مؤقت (محفوظ في cache لمدة محدودة)، فممكن الناس تضطر تمسح وتثبّت من جديد. بالمفتاح، كل النسخ بتتثبّت فوق بعض للأبد.
Without it, CI publishes a **debug** build signed with a cached throwaway key, which can change (the cache expires after ~7 idle days) and force everyone to reinstall. With it, every build is a signed release that updates the previous one forever.

On any computer with Java:

```bash
keytool -genkeypair -v -keystore naqra-sawa-release.jks -alias naqra \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 naqra-sawa-release.jks > keystore.b64      # macOS: base64 -i naqra-sawa-release.jks -o keystore.b64
```

Then add four repository secrets (GitHub → Settings → Secrets and variables → Actions → New repository secret), or with the `gh` CLI:

```bash
gh secret set ANDROID_KEYSTORE_BASE64 < keystore.b64
gh secret set ANDROID_KEYSTORE_PASSWORD     # the store password you typed
gh secret set ANDROID_KEY_ALIAS --body naqra
gh secret set ANDROID_KEY_PASSWORD          # same as the store password (keytool's default PKCS12 format has one password)
```

Re-run the `android` workflow (Actions → android → Run workflow); the release notes then say "release (signed)".

**Back up the `.jks` file and both passwords somewhere safe and never commit them.** Losing them means every user has to uninstall and reinstall; leaking them lets someone ship an "update" of your app. `*.jks` is already in `.gitignore`.

The Gradle side lives in `android/app/build.gradle`: it signs `assembleRelease` only when `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` are set (CI decodes the base64 secret into `ANDROID_KEYSTORE_FILE`).

## ٤. بناء محلي — Building locally (optional)

Needs JDK 21 and Android Studio (or the Android SDK with platform 36).

```bash
npm ci
npm run build:sw
npx cap sync android
cd android && ./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
# or: npx cap open android
```

## ٥. ملاحظات لو حبيت تنزله على Google Play — Play Store notes

- Play needs an **App Bundle**, not an APK: `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`. Use Play App Signing; the keystore above becomes your *upload* key.
- A one-time $25 Google Play developer account. New personal accounts must run a closed test with at least 12 testers for 14 days before going public (policy at the time of writing; check the Play Console).
- The package name `app.naqrasawa.reader` is permanent once published.
- Fill in the Data safety form (email sign-in, user content stored on Supabase) and link a privacy policy.
- `SCHEDULE_EXACT_ALARM` is restricted on Play: either declare why reminders need exact times, or remove that permission from `android/app/src/main/AndroidManifest.xml` and schedule reminders with `isExactNotification: false` (inexact alarms are fine for a daily reading nudge).
- Play requires a recent `targetSdkVersion` (set in `android/variables.gradle`, currently 36); bump it with Capacitor upgrades.
- A Play build and a sideloaded APK signed with different keys can't update each other; friends switching to the Play version uninstall the APK first.
