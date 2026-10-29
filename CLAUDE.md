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
Supabase project `ecptsvagvauqpxtapwst` (eu-central-1) has the first two migrations applied (run by the owner in SQL Editor, so `list_migrations` is empty). `20261029000000_author_guard.sql` (only authors change/delete notes, messages, suggestions) was applied by the owner on 2026-10-29. The Supabase connector's `apply_migration` asks the owner to confirm and that prompt never reaches their phone (it times out); so new migrations go through `.github/workflows/migrate.yml`: the `SUPABASE_DB_URL` secret (Session pooler string, docs/SETUP.md §2.4) is set and works since 2026-10-29 (run #6 recorded the three hand-applied files in `naqra_meta.applied`). Just add a migration file and push to main; check the run with `gh api` (failures show as check-run annotations). If it ever fails to connect, give the owner the raw file link for the SQL Editor. `config.js` points at it. GitHub Pages is live at https://mahmoudkhodier.github.io/naqra-sawa/. The owner did the dashboard auth setup (code email template, Gmail SMTP, URLs) and signed in live. Security advisor only flags the intended SECURITY DEFINER RPCs. Web push not set up.
Android: no release-keystore secrets; `android.yml` signs with an app key it created once and keeps in the Actions cache (`~/.naqra-signing`, kept alive by `keep-signing-key.yml`; cert SHA-256 `2C:4A:86:…:67:7C`, printed in each release's notes — it must not change). The app updates itself from the `android-latest` release (`site/js/update.js` + `AppUpdatePlugin.java`). The strips around the page (status/navigation bars, camera cut-out) are painted with the on-screen colours by `SystemUiPlugin.java` via `site/js/sysui.js` (Capacitor's SystemBars resets them to `windowBackground` on rotation; the plugin re-applies); while reading only the status bar hides (never the navigation bar), unless turned off in Settings; the reader can lock orientation (`SystemUiPlugin.orientation`). A workflow run started by hand on a non-main branch publishes a preview APK to the `android-preview` pre-release (the in-app updater only reads `android-latest`). GitHub's Actions secrets/logs/cache APIs are blocked from this sandbox; workflow dispatch and check-run annotations work via `gh api`.

## Reader notes
- Reading vs looking around: `st.front` is where reading goes on (resume point, saved as `prog.last`). Pages count only within ~2 pages of it; jumps further away are "looking around" (a bar offers «ارجع لمكانك» / «كمّل من هنا»). Opening the current portion counts. «وقفت هنا» (one line per book, private: `priv.place[bookId] = {p, y, manual}`) is placed with the edge dots and saved on leaving.
- Book look (page-by-page): RTL even pages are right-hand pages; the cover board and page-edge stack are on the outer side only.
- Private per-user data lives in `data/users/<uid>/priv`: private notes, bookmarks (`marks[book][page]` = time or `{at, t}`), `place`, `moved`/`hidden` (others' notes moved or hidden on my screen only).

## Game notes
- Everything is derived in `site/js/game.js` from shared data (no stored counters). New per-member fields in `members/<uid>` (the profile): `dg` daily goal `{k:'pages'|'mins', n}`, `gd[day]` goal reached, `hrs[day]` 24-bit mask of the hours pages were read in, `long[day]` longest sitting (min), `focus[day] = {n, m}` focus sessions, `frame` avatar frame. Per book: `prog.days[day]` pages of that book that day (written by the reader's flush).
- XP extras: daily goal 15, ¼ ½ ¾ of a book 15 each, focus 1 per minute (≤ 60 a day). Rewards (`G.FRAMES`, `G.EMOJI_PACKS`, `G.PAPERS`) unlock by `{lv}`, `{badge}` or `{secrets}`; a frame or paper that isn't unlocked never shows. Secret badges are groups with `secret: true` (tier 5), shown as «؟؟؟» with a hint until earned.
- Reader encouragement is deliberately quiet: one chip at the top edge, after scrolling stops, small cheers at most every 2 minutes, big moments queued; Settings → Reading has `rdCheer` (all/key/off), `rdPop` (+1 and buzz), `rdTurnAnim`, `rdTurnSound`, and the daily goal.
- `garden.js` (a plant per member per book), `share.js` (canvas cards shared through Capacitor Share + Filesystem, Web Share or download), `wrapped.js` (the month as a story; a banner on Today in the first 10 days of a month).

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
- `node tests/e2e/reader.js` — the PDF reader on a phone (touch, 2× screen): scrolling, zoom, book mode, notes, contents, keep-awake.
- `node tests/e2e/shelf.js` — Goodreads import, shelf search/sort/status moves, badge levels and details, the Android update prompt (stand-in native layer).
- `node tests/e2e/lang.js` — the three languages: Settings switch, the whole app in فصحى with no Egyptian words, back to مصري.
- `node tests/e2e/play.js` — the game side: goal ring, cheers, friends on the portion bar, focus, page turn, papers, secret badges, frames, journey road, garden, the month story and share cards (saved as `card-*.png` in the shots folder).
- Supabase and most of the internet are not reachable from the cloud sandbox; test against the fakes, then verify live with the user.

## Conventions
- Commits with user-visible changes carry `Whats-New: عربي || English` lines; `android.yml` collects them since the last APK into the release notes, and the app's update prompt shows the ones newer than the installed build. Keep them short and friendly.
- Three languages: «مصري» (code `ar`, the default and the app's voice), «العربية» (فصحى, code `fu`) and English (`en`). Every user-facing string goes through `L('مصري', 'English', 'فصحى')`; lists of texts are `[مصري, English, فصحى]` read as `L(x[0], x[1], x[2])`; Arabic-only bits inside a sentence use `L.a('مصري', 'فصحى')`. A missing فصحى falls back to مصري. `L.isAr()` is true for both Arabics; `L.count` has فصحى plural forms. `tests/e2e/lang.js` walks the app in فصحى and fails on Egyptian words — add the فصحى form whenever you add a text.
- Avoid gendered third-person verbs about other members (use nouns like «تشجيع من سارة») — in all three languages.
- Never store names/emails from auth in shared docs except the user's own chosen `nick` in their profile.
- Keep every relative path relative (the site is served from a GitHub Pages sub-path and from `https://localhost` inside the APK).
