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