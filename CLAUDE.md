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
Supabase project `ecptsvagvauqpxtapwst` (eu-central-1) has the first two migrations applied (run by the owner in SQL Editor, so `list_migrations` is empty). `20261029000000_author_guard.sql` (only authors change/delete notes, messages, suggestions) was applied by the owner on 2026-10-29. The Supabase connector's `apply_migration` asks the owner to confirm and that prompt never reaches their phone (it times out); so new migrations go through `.github/workflows/migrate.yml`: the `SUPABASE_DB_URL` secret (Session pooler string, docs/SETUP.md §2.4) is set and works since 2026-10-29 (run #6 recorded the three hand-applied files in `naqra_meta.applied`). `20261029120000_owner_guard.sql` (only you write your reading progress; cheers/nudges in your own name) went out this way on 2026-10-29. Just add a migration file and push to main; check the run with `gh api` (failures show as check-run annotations). If it ever fails to connect, give the owner the raw file link for the SQL Editor. `config.js` points at it. GitHub Pages is live at https://mahmoudkhodier.github.io/naqra-sawa/. The owner did the dashboard auth setup (code email template, Gmail SMTP, URLs) and signed in live. Security advisor only flags the intended SECURITY DEFINER RPCs. Web push not set up.
Android: no release-keystore secrets; `android.yml` signs with an app key it created once and keeps in the Actions cache (`~/.naqra-signing`, kept alive by `keep-signing-key.yml`; cert SHA-256 `2C:4A:86:…:67:7C`, printed in each release's notes — it must not change). The app updates itself from the `android-latest` release (`site/js/update.js` + `AppUpdatePlugin.java`). The strips around the page (status/navigation bars, camera cut-out) are painted with the on-screen colours by `SystemUiPlugin.java` via `site/js/sysui.js` (Capacitor's SystemBars resets them to `windowBackground` on rotation; the plugin re-applies); while reading only the status bar hides (never the navigation bar), unless turned off in Settings; the reader can lock orientation (`SystemUiPlugin.orientation`). A workflow run started by hand on a non-main branch publishes a preview APK to the `android-preview` pre-release (the in-app updater only reads `android-latest`). GitHub's Actions secrets/logs/cache APIs are blocked from this sandbox; workflow dispatch and check-run annotations work via `gh api`.

## Shelves, Goodreads, private books (2026-10-30, on the work branch)
- Shelves are one row per book in `shelf_books` (platform.js merges them with the old `shelves.data.items`, which is kept as is while older APKs are around: `KEEP_LEGACY`). Writing `shelf/<me>` with `{items}` sends only changed books; other keys merge (null removes one).
- Goodreads sync: RPC `goodreads_feed` fetches the public RSS through the `http` extension (enabled by the migration only if available); `Imp.syncGoodreads` merges by grId / title+author and never overwrites what the member changed (`item.gr` remembers Goodreads' last values). Not yet tried against goodreads.com.
- Private books: `data/users/<uid>/my/books|prog/<id>` (ids `my-…`), files in `<circle>/private/<uid>/…` (storage policies in `20261030002000_private_books.sql`). `D.book(id)` finds circle or private books.
- Extension points in v-core.js: `V.addRoute`, `V.addSection('me'|'shelf')`, `V.addMenu('shelf')`; features in `v-me.js` (stats, «دفتر اقتباساتي») and `v-worm.js` (taste, pick, challenges).

## Notifications and widget (Android, on the work branch)
- No Firebase: the app registers a random device token (`register_device`, only its sha256 is stored in `devices`); `InboxWorker` (WorkManager, every ~15 min online) calls the anon RPC `device_inbox(token, since)` and posts cheers, nudges and replies in the member's language (`InboxPlugin`). Battery savers (Xiaomi/Oppo/Samsung) can delay or stop it. Web push for the installed web app still needs the `notify` function deployed (not done).
- Widget «وردك النهارده» (`Widget*` classes): the app sends ready-made texts through the plugin (`site/js/widget.js`, after data changes and when leaving the app).
- Local Android build: SDK in `~/android-sdk` (installs from dl.google.com); Maven Central can answer 429 from the sandbox, a `~/.gradle/init.d/mirror.gradle` pointing at Google's mirror fixes it; `./gradlew assembleDebug` in android/.
- Invites: `site/js/invite.js` draws a picture card and shares it with the link; the link's preview is `site/icons/og.png` (`scripts/render-og.js`).

## Owner's picks (2026-10-30, round 2)
- Plan tab is a calendar (`wirdCal` in v-books.js): week rows from Saturday, a portion on its days, faces of those who finished it.
- Race card on Today has tabs «الورد ده / الأوراد كلها / الكتاب كله» (`raceTab` kept per phone, swipe too); «الأوراد كلها» = dot grid + «شجّعهم كلهم».
- Reader eye opens «اللي يظهر على الصفحات» (`marksPanel`): presets + kinds + people; `rdMarks` may be `custom` with `rdMarksF = {hk, hp}` (others' marks only).
- Circle news: search, kind chips, person filter; highlights in a row fold into one card.
- Reader portion bar: a square per page (`#rd-wprog`, `#rd-wline` with a tag sideways).
- Who may change a plan: owner, admins («مشرف»), whoever added the book (`V.canPlan`). A portion's pages move by a page or two from its sheet («عدّل صفحات الورد ده») or from the reader menu («الورد ٣ يخلص في الصفحة دي»): `V.moveBound` — the next portion takes the difference, dates stay.
- My role is re-read on every fetch of members (`st.roleSent` in platform.js): someone made «مشرف» while the app was closed gets the powers on the next open.
- Inbox («الجديد ليك») drops from the top (`V.sheet({top: true})`), has «علّم الكل اتقرا» (also dismisses the cheers on «اليوم»); seen time also kept in `priv.inboxSeen`.
- The weekly circle recap pops up by itself only when no sheet and no book is open (Fridays broke tests that didn't close sheets).

## Daily quests (2026-11-02, `site/js/quests.js`)
- From `G.QUEST_V2` on (set it to the day they ship, never earlier): reading = my portion («خلّص الورد ٤») or «الحق الورد ٣», a page count when the portion is long or there's no plan; people = answer an open question / react to a friend's highlight / cheer someone behind (generic «شارك مرتين» only when there's nothing); reflection = takeaway of a portion just finished, rating a book just finished, else a highlight or question in today's portion; optional bonus (focus 15 min or a portion and a half, +20 XP).
- The day's set is picked once and kept in `priv.quests` (one swap a day, `swap: 1`). Done → `members/<me>.questDays[day] = {b}`; game.js counts XP from that (old days keep the old random quests). Chest extras the same on every phone: `G.chestReward` (freeze / +15 XP / wisdom); 5 full days in a week = big chest +100.
- Tapping a quest runs `act` (open the reader at the right page, the note, a cheer, the takeaway, the shelf item, focus sheet via `R.focusOpen`).

## Young readers (2026-11-02)
- Stations: a portion in stretches of 2–3 pages (≤5), star gaps on `#rd-wprog`, a cheer per station (`stations()` in reader.js; replaced the half/last cheers).
- «مستعجل؟ ٥ دقايق بس» under the Today button: the reader + `R.focusQuick(5)`.
- «من غير حرق» (`V.noSpoil`, on by default, Settings + the eye panel): others' notes on pages past `D.reach(book)` show as `V.lockedCard` (feed, notes tab, takeaways), are hidden in the reader (count in `#rd-ahead` 👀) and are not quest targets.
- Golden page: `G.goldenPage(book, w, uid)`; found on reading it → `members/<me>.gold["book|wid"] = day`, +15 XP.
- Reactions: long-press a line → emoji bar; one doc per member and line in col `reacts` (`{b, page, y, e, by}`, author-only via `20261102000000_reacts_guard.sql`); bubbles on the inner margin; kind `react` in the eye filter.
- Behind: «اقرا ١٠ صفحات بس النهارده» + button in the catch-up row. Quote as a story picture: `V.storyCard` / `V.storySheet` (story.js), shared with `V.sharePicture` (invite.js).
- «اليوم البسيط» (`V.simple()`): Today = portion, race, quests only; hides «اختارلي كتاب» and «تحدياتي». This phone's Settings, else `meta/circle.simple[uid]` set by the owner/admin from the member menu.
- Weekly boss: see «Play» below (Noto animated monsters; hand-drawn SVG was rejected).

## Play: characters, «ورقات», throwing, weekly boss (2026-11-02, `site/js/play.js`)
- Animations: Google Noto Animated Emoji (CC BY 4.0, credit at the bottom of Settings) in `site/anim/<code>.json`, played by `vendor/lottie_light.min.js` through `site/js/lot.js` (`A.Lot`): placeholders `<i class="lot" data-lot="1f981" data-key="…">` are filled after each render and reused by key; off-screen ones pause, gone ones are destroyed; `anim/` is not precached by the service worker (fetched when first shown). More codes: `https://fonts.gstatic.com/s/e/notoemoji/latest/<code>/lottie.json`.
- Characters: a member's mark; the animated ones (`P.CHARS`) open at pages read in the app (`members/<uid>.days`, never Goodreads or paper). Picker in Settings («غيّر علامتك»), a sheet when one opens.
- «ورقات» = pages read in the app − price of what you threw. `throws/<id> = {by, to, it, at}` (author-only, `20261102000000_reacts_guard.sql`); 15 items at 1–3 sheets, friendly ones make the friend's character happy, pranks make it sad; limits 30 a day / 10 per friend; `members/<uid>.noThrows` turns it off (Settings). The receiver sees a scene once on the next open (`priv.throwsSeen`), then it's in «الجديد ليك». Where: «الحلقة ← الأعضاء» top card, a member's menu, the scene's «ردّ».
- Weekly boss (`P.boss`, replaces the old «الحلقة الأسبوع ده» card; mini card on Today): a monster per week from 8 (all stay in place in their animation), health = `meta/circle.weeklyGoal`, hits = `G.weekPagesOf` (any pages); opening it replays the hits since this phone last looked (`bossSeen:` in U.store); beaten → +50 XP to everyone who hit it (game.js `bossWins`).
- Reactions bar: Facebook-like (pop-in, slide-to-pick with labels, fly to the line, burst).

## Reader notes
- When a page counts (reader.js `pageChanged`/`tick`): on going on from it one or two pages after ≥4 s on it (≥10 s past the end of my portion), or after staying on it ~0.6 × my seconds per page (20–90 s). Never on arrival. `st.front` follows forward steps after ≥2 s on a page (not pages a long scroll runs through).
- Reading vs looking around: `st.front` is where reading goes on (resume point, saved as `prog.last`). Pages count only within ~2 pages of it; jumps further away are "looking around" (a bar offers «ارجع لمكانك» / «كمّل من هنا»). Opening the current portion counts. «وقفت هنا» (one line per book, private: `priv.place[bookId] = {p, y, manual}`) is placed with the edge dots and saved on leaving.
- Book look (page-by-page): RTL even pages are right-hand pages; the cover board and page-edge stack are on the outer side only.
- Private per-user data lives in `data/users/<uid>/priv`: private notes, bookmarks (`marks[book][page]` = time or `{at, t}`), `place`, `moved`/`hidden` (others' notes moved or hidden on my screen only).

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
- `node tests/e2e/ui.js` — the app's frame on a phone: back steps, one message at a time, pull to refresh, shelf header, mark picker, sign-out warning.
- Phase 3/4 suites: `together.js` (circle recap, «خلّصناها», invite card), `focus.js`, `goals.js` (daily goal, forecast, weekly streak, firsts), `native.js` (stand-in Android layer: notifications device, widget data).
- Phase-2 suites: `node tests/e2e/library.js` (shelf_books rows, 3,000 books, legacy shelf), `goodreads.js` (RSS sync merge), `me.js` (stats, quotes notebook), `worm.js` (taste match, pick a book, challenges), `private.js` (private library).
- `node tests/e2e/play.js` — characters, sheets, throwing and the scene, opening a character, the boss and its replay, the animated reaction bar.
- `node tests/e2e/young.js` — stations, 5 minutes, no spoilers, golden page, reactions, catch-up line, story picture, Simple Today.
- `node tests/e2e/quests.js` — daily quests from the portion, people and reflection, swap, recorded day, chest.
- `node tests/e2e/plan.js` — plan calendar, who may change it, moving a portion's pages (sheet and reader), «مين وصل فين» tabs.
- `node tests/e2e/screens.js` — screenshots of every main screen for a visual review (`LANGS=eg,ar,en THEMES=light,dark LAND=1`), in `tests/e2e/shots/screens/`.
- `node tests/e2e/shelf.js` — Goodreads import, shelf search/sort/status moves, badge levels and details, the Android update prompt (stand-in native layer).
- Supabase and most of the internet are not reachable from the cloud sandbox; test against the fakes, then verify live with the user.

## Conventions
- Commits with user-visible changes carry `Whats-New: مصري || English || فصحى` lines (فصحى optional); `android.yml` collects them since the last APK into the release notes, and the app's update prompt shows the ones newer than the installed build. Keep them short and friendly.
- Three languages: مصري (default, `eg`), العربية فصحى (`ar`), English. All user-facing strings go through `L('مصري', 'English', 'فصحى')` (third optional, falls back to the first); style guide and fixed names in `docs/LANGUAGES.md`. Avoid gendered third-person verbs about other members (use nouns like «تشجيع من سارة»).
- Never store names/emails from auth in shared docs except the user's own chosen `nick` in their profile.
- Keep every relative path relative (the site is served from a GitHub Pages sub-path and from `https://localhost` inside the APK).
