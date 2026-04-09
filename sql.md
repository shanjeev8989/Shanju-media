## Step 10 — Daily Expenses table (run in Supabase SQL editor)

```sql
CREATE TABLE IF NOT EXISTS expenses (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        timestamptz DEFAULT now(),
  date              date NOT NULL,
  member_name       text,
  client_name       text,
  category          text,
  amount            numeric DEFAULT 0,
  description       text,
  payment_method    text,
  is_shoot          boolean DEFAULT false,
  shoot_name        text,
  location          text,
  transport_expense numeric DEFAULT 0,
  food_expense      numeric DEFAULT 0,
  stay_expense      numeric DEFAULT 0,
  other_expense     numeric DEFAULT 0
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON expenses FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

## Step 9 — Daily Update table (run after Step 8)

```sql
CREATE TABLE IF NOT EXISTS daily_updates (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  member_name   text NOT NULL,
  update_date   date NOT NULL DEFAULT CURRENT_DATE,
  before_lunch  jsonb DEFAULT '[]',
  after_lunch   jsonb DEFAULT '[]',
  morning_done  boolean DEFAULT false,
  eod_done      boolean DEFAULT false,
  UNIQUE(member_name, update_date)
);

ALTER TABLE daily_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON daily_updates;
CREATE POLICY "auth_all" ON daily_updates FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
```

---

## Step 8 — Client Follow-Up tables (run after Step 7)

```sql
CREATE TABLE IF NOT EXISTS client_followups (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  client_name text NOT NULL,
  shoot_date  date NOT NULL,
  notes       text,
  manual_date date,
  manual_note text
);

CREATE TABLE IF NOT EXISTS client_reviews (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  followup_id uuid REFERENCES client_followups(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  review_text text,
  sentiment   text DEFAULT 'positive',
  review_date date DEFAULT CURRENT_DATE
);

ALTER TABLE client_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_reviews   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON client_followups FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON client_reviews   FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
```

---

## Step 7 — Advance field in payments (run after Step 6)

```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS advance numeric DEFAULT 0;
```

---

## Step 6 — Daily tracking + Caption workflow (run after Step 5)

```sql
-- Track when a task/post status was last changed (used for daily + monthly counts)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Caption workflow: manager marks caption work as done, notifying the editor
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS caption_done boolean DEFAULT false;
```

---

## Step 5 — Assign editor to posts (run after Step 4)

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS assigned_editor text;
```

---

## Step 4 — Role rename + Pipeline redesign (run after Step 3)

Run this in your Supabase **SQL Editor**:

```sql
-- Rename 'admin' role to 'manager' in profiles table
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'manager', 'editor'));

-- Update any existing admin rows to manager
UPDATE profiles SET role = 'manager' WHERE role = 'admin';

-- Add new pipeline columns for per-content-item tracking
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS content_title text;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS task_id uuid;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS content_status text DEFAULT 'Planned';
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS planned_date date;
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS posted_date date;
```

---

## Step 3 — Approval System (run after Step 2)

```sql
-- Add approval status to profiles
alter table profiles add column status text not null default 'pending'
  check (status in ('pending', 'approved'));

-- Trigger: auto-approves owner email, all others start as pending
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, status)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    case when new.email = 'shanjeevsivasankar@gmail.com' then 'owner' else new.raw_user_meta_data->>'role' end,
    case when new.email = 'shanjeevsivasankar@gmail.com' then 'approved' else 'pending' end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Allow Shanju to approve/reject users
create policy "profiles_update" on profiles for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "profiles_delete" on profiles for delete
  using (auth.role() = 'authenticated');
```

---

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