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
