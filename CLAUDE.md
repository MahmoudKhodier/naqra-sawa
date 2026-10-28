# نقرأ سوا — notes for Claude

Arabic-first reading-circle app (PWA + Android via Capacitor) backed by Supabase. The owner is non-technical and works from a phone: keep replies short, in Arabic (Egyptian-friendly) unless they write in English, outcome first.

## Layout
- `site/` — the app (plain HTML/CSS/JS, no build). Script order is in `site/index.html`. `site/config.js` holds the public Supabase URL + anon key.
- `site/js/platform.js` — Supabase layer exposing `window.claude.use('db'|'user'|'assets'|'room'|'downloads')`, the API the views were written against (doc/collection/onSnapshot/set/update/delete). Circle-scoped JSON docs live in table `docs(circle_id, col, id, data, deleted, updated_at)`; `members/<uid>` maps to `profiles`, `shelf/<uid>` to `shelves`, `meta/circle` to the `circles` row. Deletes are soft; clients sync by `updated_at` and cache in IndexedDB.
- `site/js/auth.js` — email-code sign-in, circles, invite links `#join-<code>`, member roles.
- `supabase/migrations/` — schema + RLS + storage buckets (`books` private, `covers` public). `supabase/functions/notify` + `supabase/setup/push.sql` — optional web push.
- `android/`, `capacitor.config.json`, `.github/workflows/` — APK build (release `android-latest`) and GitHub Pages deploy.
- `tests/sql/` — RLS tests on a throwaway local Postgres 16. `tests/fake-supabase/` + `tests/e2e/` — fake Supabase on local Postgres for Playwright end-to-end tests.

## Status (2026-10-28)
Supabase project `ecptsvagvauqpxtapwst` (eu-central-1) has both migrations applied (run by the owner in SQL Editor, so `list_migrations` is empty). `config.js` points at it. GitHub Pages is live at https://mahmoudkhodier.github.io/naqra-sawa/. Security advisor only flags the intended SECURITY DEFINER RPCs (they check permissions themselves). Pending: auth email template, SMTP, URL config (dashboard), then a live smoke test. Web push not set up.

## Provisioning checklist (do this when the Supabase connector is available)
1. List orgs/projects; create a project named `naqra-sawa` on the FREE plan (confirm the cost is $0 with the user before creating), region closest to Egypt (eu-central-1).
2. Apply `supabase/migrations/*.sql` in order with the migration tool. Re-run `tests/sql/run.sh` locally first if you changed SQL.
3. Get the project URL and the anon/publishable key; write them into `site/config.js`; commit and push to `main`.
4. Ask the user to do the dashboard-only steps in `docs/SETUP.md` §1.3–1.5 (email template with `{{ .Token }}`, custom SMTP, Site URL / redirect URLs) — give them exact text to paste.
5. GitHub: enable Pages with "GitHub Actions" as the source if the API allows; otherwise tell the user where to click. After the Android workflow runs, set `apkUrl` in `config.js`.
6. Optional web push: generate VAPID keys, deploy `notify` with JWT verification off, set its secrets, run `supabase/setup/push.sql` with real values (never commit secrets), set `vapidPublicKey`.
7. Smoke-test on the live site with the user (sign in, create circle, invite link, upload a small PDF).

## Testing
- `bash tests/sql/run.sh` — database rules.
- `node tests/e2e/smoke.js` — full UI flow against the fake Supabase (see tests/e2e for details).
- Supabase and most of the internet are not reachable from the cloud sandbox; test against the fakes, then verify live with the user.

## Conventions
- All user-facing strings go through `L('عربي', 'English')`. Avoid gendered third-person verbs about other members (use nouns like «تشجيع من سارة»).
- Never store names/emails from auth in shared docs except the user's own chosen `nick` in their profile.
- Keep every relative path relative (the site is served from a GitHub Pages sub-path and from `https://localhost` inside the APK).
