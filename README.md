# نقرأ سوا — Read Together

حلقة قراءة لأصحابك وعيلتك: ترفعوا كتاب PDF، تقسّموه أوراد، تقرأوه جوه التطبيق، تظلّلوا وتعلّقوا على الصفحات، وتتناقشوا — ومع ده نقاط XP ومستويات وسلاسل أيام ومهام يومية وأوسمة عشان تفضلوا مكمّلين.

A reading circle for friends and family: upload a PDF, split it into daily portions, read it in the app, highlight and comment on pages, and discuss — with XP, levels, streaks, daily quests and badges to keep everyone coming back.

## What's inside

| Part | Where |
|---|---|
| Installable web app (PWA), Arabic-first, RTL/LTR | `site/` |
| PDF reader (pdf.js), highlights, pinned notes, night/sepia, pinch zoom, offline book cache | `site/js/reader.js` |
| Circles, sign-in by email code, invites, members | `site/js/auth.js` |
| Supabase sync layer (live updates, offline cache, presence, file storage) | `site/js/platform.js` |
| Game layer: XP, levels, streaks, quests, badges, leaderboards | `site/js/game.js` |
| Book lookup (Google Books + Open Library) and cover photos | `site/js/booksearch.js` |
| Daily reminders (Android: on-device; web: push) | `site/js/reminders.js`, `supabase/functions/notify` |
| Database schema, security rules, storage buckets | `supabase/migrations/` |
| Android app (Capacitor) | `android/`, `capacitor.config.json` |
| Hosting and APK builds | `.github/workflows/` |

## Setting it up

See **[docs/SETUP.md](docs/SETUP.md)** (Arabic + English). In short:

1. Create a free Supabase project, run the migration, and put the project URL and anon key in `site/config.js`.
2. Push to GitHub: the `pages` workflow publishes the web app; the `android` workflow builds `naqra-sawa.apk` and attaches it to the `android-latest` release.
3. Share the app link. People sign in with their email and join your circle through an invite link.

## Free-plan limits worth knowing

- Supabase free plan: 500 MB database, **1 GB file storage** (roughly 20–50 PDF books depending on size), 50 MB per file (the app splits bigger PDFs automatically), projects pause after a week with no activity.
- Google Books search works without a key at low volume; a free key in `config.js` makes it reliable.

## Development

`site/` is plain HTML/CSS/JS with no build step. `tests/` holds end-to-end tests (Playwright) that run against a local Postgres with the real migration and security rules.
