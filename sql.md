## Step 2 — Auth & Roles (run this AFTER Step 1)

Run this in your Supabase **SQL Editor**:

```sql
-- Profiles table: maps each Supabase auth user to a team member + role
create table profiles (
  id   uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "profiles_read" on profiles for select using (auth.role() = 'authenticated');

-- Profile is created automatically via trigger (see below) — no insert policy needed

-- Auto-create profile when a user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'role'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Update all existing table policies to require login
drop policy "allow all" on tasks;
drop policy "allow all" on shoots;
drop policy "allow all" on posts;
drop policy "allow all" on pipeline;
drop policy "allow all" on payments;
drop policy "allow all" on invoices;

create policy "auth_all" on tasks    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all" on shoots   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all" on posts    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all" on pipeline for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all" on payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all" on invoices for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

**Also do this in Supabase Dashboard:**
- Go to **Authentication → Providers → Email**
- Turn OFF "Confirm email" — so team members can log in immediately after signing up

---

### Default accounts (suggested credentials)

| Name    | Email                      | Password     | Role   |
|---------|----------------------------|--------------|--------|
| Shanju  | shanju@shanjumedia.com     | Shanju@2025  | owner  |
| Bava    | bava@shanjumedia.com       | Bava@2025    | admin  |
| Bharath | bharath@shanjumedia.com    | Bharath@2025 | editor |
| Minhaaj | minhaaj@shanjumedia.com    | Minhaaj@2025 | editor |
| Gowtham | gowtham@shanjumedia.com    | Gowtham@2025 | editor |

Each person signs up once using the Sign Up tab — role is assigned automatically based on their name.

---

## Step 1 — Initial tables (run this first)

This is the SQL initially claude made me run:

```create table tasks (id uuid default gen_random_uuid() primary key, created_at timestamptz default now(), client text, name text, type text, owner text, deadline date, status text default 'Not started', priority text default 'Medium', blocker text, next_step text, done boolean default false);

create table shoots (id uuid default gen_random_uuid() primary key, created_at timestamptz default now(), client text, date date, type text, owner text, notes text);

create table posts (id uuid default gen_random_uuid() primary key, created_at timestamptz default now(), client text, date date, platform text, content_type text, caption_status text, notes text);

create table pipeline (id uuid default gen_random_uuid() primary key, client text, planned int default 2, shot boolean default false, edit boolean default false, qc boolean default false, approved boolean default false, caption boolean default false, scheduled boolean default false, posted int default 0);

create table payments (id uuid default gen_random_uuid() primary key, created_at timestamptz default now(), client text, amount numeric, type text, status text, due_date date, project text, notes text);

create table invoices (id uuid default gen_random_uuid() primary key, created_at timestamptz default now(), client text, invoice_num text, total numeric, advance numeric default 0, invoice_date date, due_date date, services text, status text default 'Unpaid');

alter table tasks enable row level security;
alter table shoots enable row level security;
alter table posts enable row level security;
alter table pipeline enable row level security;
alter table payments enable row level security;
alter table invoices enable row level security;

create policy "allow all" on tasks for all using (true) with check (true);
create policy "allow all" on shoots for all using (true) with check (true);
create policy "allow all" on posts for all using (true) with check (true);
create policy "allow all" on pipeline for all using (true) with check (true);
create policy "allow all" on payments for all using (true) with check (true);
create policy "allow all" on invoices for all using (true) with check (true);
```