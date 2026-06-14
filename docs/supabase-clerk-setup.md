# Supabase + Clerk Setup

This app uses Clerk for identity and can pass Clerk session tokens to Supabase.

## Required environment variables

Add these to your app environment:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
VITE_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
```

## Supabase dashboard setup

1. In the Clerk dashboard, open the Supabase integration setup page and activate the Supabase integration.
2. Copy the Clerk domain shown there.
3. In Supabase, go to `Authentication -> Sign In / Providers`.
4. Add `Clerk` as a third-party auth provider.
5. Paste the Clerk domain.

This uses Supabase's native Clerk integration. Do not use the deprecated Clerk Supabase JWT template for new setup.

## App code

Use the helper in [client/src/lib/supabase.ts](../client/src/lib/supabase.ts):

- `useSupabaseClient()` inside React components
- `createClerkSupabaseClient()` if you need to provide your own token getter

The helper passes the current Clerk session token into Supabase through the `accessToken` option.

## Example RLS policy

If you want a table scoped to the signed-in Clerk user:

```sql
create table if not exists public.tasks (
  id bigserial primary key,
  name text not null,
  user_id text not null default auth.jwt()->>'sub'
);

alter table public.tasks enable row level security;

create policy "User can view their own tasks"
on public.tasks
for select
to authenticated
using (
  (select auth.jwt()->>'sub') = user_id
);

create policy "Users must insert their own tasks"
on public.tasks
for insert
to authenticated
with check (
  (select auth.jwt()->>'sub') = user_id
);
```

## Organization-aware RLS example

```sql
create policy "Only organization admins can insert"
on public.secured_table
for insert
to authenticated
with check (
  (
    ((select auth.jwt()->>'org_role') = 'org:admin')
    or
    ((select auth.jwt()->'o'->>'rol') = 'admin')
  )
  and
  (
    organization_id = (
      select coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
    )
  )
);
```
