# Better Me — Supabase automatic saving

The existing GitHub Pages app and its original localStorage data format are retained. Cloud sync is optional and must be enabled per account.

## Setup

1. Use the existing Supabase project and public.better_me_backups table.
2. Verify email sign-in is enabled. Set the Site URL to https://rihasdev.github.io/betterMe2.0/.
3. In Better Me, open Data & Settings and enter the Supabase project URL and publishable (or legacy anon) key. Never enter a secret or service-role key.
4. Sign in. The browser remembers the project URL, public key and Supabase session. Passwords are not stored by Better Me.
5. Enable automatic saving and confirm that private journal and health records may be uploaded.
6. Check the status, then verify a row in Table Editor.

### SQL for a new project only

If your existing manual backup works, you do not need to change your database. For a new dedicated project, use:

```sql
create table if not exists public.better_me_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  backup jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.better_me_backups enable row level security;
revoke all on public.better_me_backups from anon;
grant select, insert, update, delete on public.better_me_backups to authenticated;
drop policy if exists "Users manage own backup" on public.better_me_backups;
create policy "Users manage own backup" on public.better_me_backups
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

Review existing policies before use: an unrelated permissive policy can undermine isolation. Keep RLS enabled.

## Sync behavior

- Local saves are immediate. Cloud sync is debounced approximately three seconds and checks remote changes on opening, foregrounding, reconnecting and every 30 seconds while visible.
- A clean device can restore a newer cloud copy; first-time devices with different nonempty histories require a manual merge. Conflicting edits are never silently overwritten. The server revision is checked in the same conditional update, or an initial insert must succeed without an upsert.
- For a conflict, use Download & merge cloud backup, choose how to handle overlapping dates/settings, review the result, then re-enable auto-save or manually upload. A pre-sync local recovery snapshot can be exported; it contains private data.
- Another browser tab changing local data pauses saving in the stale tab. Export any in-memory edits before reloading. This is not a transactional multi-tab editor; use one tab per device.
- The SDK is loaded on demand from a version-pinned CDN; if it cannot load, local features remain usable. Persistent sessions are browser-local; sign out on shared devices. The app does not continuously run when closed. No password, service-role key or secret is committed.

## Validation

Run `node --test tests/cloud-core.test.cjs`. This tests the reconciliation logic with mocked storage/network, not live Supabase. For end-to-end verification use two browsers on a test account: verify local persistence; enable auto-save; refresh; edit while offline; reconnect; restore on a clean second browser; create differing offline edits in both browsers and verify conflict status and recovery export. Test RLS with two distinct users and confirm cross-user reads/writes are denied.

## Salah & Dhikr upgrade

Detailed faith records are stored under each selected date in the existing version 2 backup (`days[date].faith`). No new database table or SQL migration is necessary. Update and refresh every browser/device before recording Dhikr or Sunnah progress; older versions do not understand the additional fields and could discard them. Export a JSON backup before upgrading. The 42 routine activities and their completion score are unchanged. Faith counters and the 12-Rak'ah tracker are tracked separately. The guide uses the supplied content and source references; it is not a prayer-time calculator. Tests: `node --test tests/*.test.cjs`.

## Workout trackers

The warm-up, strength training and cool-down entries each have an expandable tracker and a + Add exercise button. Individual exercises record name, sets, repetitions per set, weight in kg, duration, notes and completion. These optional date-specific records live at `days[date].workoutLog` in the existing JSON backup and use the original local save and Supabase sync flow. They are separate from the routine score and do not overwrite the existing manually logged workout-duration metric. Refresh all devices after deploying before recording workout details; older clients do not preserve these additional fields. No SQL change is needed.

## Fixed weekly workout split

Effective for dates on or after 2026-11-25: Monday Upper Body, Tuesday Lower Body, Wednesday Rest, Thursday Push, Friday Pull, Saturday Legs, Sunday Rest. The three morning workout phase activities are scheduled on the five training days; weekday controls for these three entries reflect the fixed split. On recovery days they are excluded from the completion denominator, while optional mobility and stretching logs remain accessible. Existing recorded snapshots before the effective date and any saved workout details remain intact. The effective schedule also applies to old saved routines without a database migration. Refresh all devices after deployment. No SQL change is needed.

## Manual prayer and daylight timetable

The top of every view contains eight editable times for the selected date: Tahajjud, Fajr, sunrise, Dhuhr, Asr, sunset, Maghrib and Isha. Times are intentionally blank until entered; the previous date can be copied explicitly and adjusted. Use the local mosque timetable and your chosen valid Tahajjud time. No external timing API or location is used. The five entered Fard times override the displayed daily routine times for the selected date only; all other activities, counts and stored routine defaults are preserved. Clearing manual times returns the routine to its existing estimates. Records are saved under `days[date].prayerTimes` in the same version 2 JSON backup and use existing localStorage and Supabase sync. No database migration is needed. Refresh all devices after deployment before entering new times, as older clients do not preserve this optional field.

## Adhan, Iqamah and carry-forward timings

All five prayers have separate manually entered Adhan and Iqamah times, alongside Tahajjud, sunrise and sunset (13 fields). Earlier prayer values are retained as Adhan. Each individual field inherits the most recent entered value on or before the selected date; future entries never affect earlier dates. Editing a field changes it from that date onward until another explicit entry. Clearing a field stops inheritance via `days[date].prayerTimeCleared`; it does not remove earlier values. Clear all applies the same rule to all fields. The daily prayer activity uses Iqamah if entered, otherwise Adhan, otherwise the existing routine estimate. Verify inherited times against the local mosque as times change. Existing date records and backup version remain compatible; no SQL migration. Refresh every device before entering the new fields.


## Rich-text notebook

Notes is independent of the selected routine date and existing journal. Create, search, edit and delete titled notes using the Notes tab. The toolbar supports bold, italic, underline, strikethrough, headings, ordered and unordered lists, quotes and code blocks. Formatting is saved as allowlisted structured text, not executable HTML; external pasted content is plain text. No external editor dependency is needed. Browser formatting uses native editing commands and may vary across mobile browsers.

Notes are optional in the existing version 2 JSON backup under `notebook` and are included in local saving, export/import and Supabase sync. No SQL changes are required. Enable auto-save in Data & settings; refresh **every device** before creating notes, as older builds do not preserve notebook fields. Export a backup first. Deleted notes leave lightweight tombstones to carry deletions across devices and merge; manual conflicts let you explicitly choose local or imported versions for differing note IDs. Independent note IDs are retained. Limits: 500 records including tombstones, 100,000 serialized body characters per note and 2,000,000 serialized notebook characters overall. This is not a real-time collaborative editor.

Verify on two updated browsers with one test account: create a formatted note, wait for cloud saved status, refresh, restore on the other browser, edit offline and reconnect, and verify deletion and conflict recovery. Confirm existing journal, routine and prayer records remain unchanged. Run `node --check notes.js` and `node --test tests/*.test.cjs`. Live Supabase and browser interaction require a separate manual check.
