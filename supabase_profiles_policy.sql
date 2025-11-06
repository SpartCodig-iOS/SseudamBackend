alter table public.profiles enable row level security;

drop policy if exists "Public profiles read" on public.profiles;
create policy "Public profiles read" on public.profiles for select
  using ( true );

drop policy if exists "Profiles insert by service role" on public.profiles;
create policy "Profiles insert by service role" on public.profiles for insert
  with check ( auth.role() in ('service_role', 'authenticated') );
