-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- NOTE: If you already have these tables, scroll down to the MIGRATION section below.

-- SALES TABLE
create table if not exists sales (
  id          bigserial primary key,
  user_id     text,
  date        date not null,
  description text not null,
  category    text not null,
  amount      numeric(12, 2) not null,
  receipt     text,
  is_deleted  boolean not null default false,
  created_at  timestamptz default now()
);

-- EXPENSES TABLE
-- vendor is optional (nullable) — users may not always know the vendor
-- receipt stores the filename of the uploaded file (optional)
create table if not exists expenses (
  id          bigserial primary key,
  user_id     text,
  date        date not null,
  description text not null,
  category    text not null,
  vendor      text,
  amount      numeric(12, 2) not null,
  receipt     text,
  is_deleted  boolean not null default false,
  created_at  timestamptz default now()
);

-- Indexes for performance when filtering by user_id
create index if not exists idx_sales_user_id on sales (user_id);
create index if not exists idx_expenses_user_id on expenses (user_id);

-- Enable Row Level Security (optional but recommended)
alter table sales    enable row level security;
alter table expenses enable row level security;

-- Allow all operations for now (you can restrict later per user)
create policy if not exists "Allow all on sales"    on sales    for all using (true);
create policy if not exists "Allow all on expenses" on expenses for all using (true);


-- Sample seed data (optional - delete if you want to start fresh)
insert into sales (date, description, category, amount) values
  ('2026-05-03', 'Product batch A',      'Product', 12000),
  ('2026-05-10', 'Online orders',         'Online',  8500),
  ('2026-04-15', 'Service consultation', 'Service', 15000),
  ('2026-04-02', 'Product batch B',       'Product', 9700),
  ('2026-03-20', 'Wholesale deal',        'Online',  19000);

insert into expenses (date, description, category, vendor, amount) values
  ('2026-05-01', 'Monthly supplies', 'Supplies',  'ABC Supply Co.', 18500),
  ('2026-05-01', 'Office rent',      'Rent',       'Realty Corp',    15000),
  ('2026-05-05', 'Staff salaries',   'Salaries',   'Internal',       13500),
  ('2026-04-01', 'Utility bills',    'Utilities',  'Meralco',         8000),
  ('2026-03-01', 'Supplies restock', 'Supplies',   'ABC Supply Co.',  6500);


-- ============================================================
-- MIGRATION: Run these if the tables already exist in Supabase
-- These are safe to run even if the columns already exist.
-- ============================================================

-- Add receipt column to expenses if it doesn't exist yet
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'expenses' and column_name = 'receipt'
  ) then
    alter table expenses add column receipt text;
  end if;
end $$;

-- Make vendor nullable if it was created as NOT NULL
do $$
begin
  alter table expenses alter column vendor drop not null;
exception
  when others then null; -- silently ignore if already nullable
end $$;

-- Add is_deleted column to sales if it doesn't exist yet
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'sales' and column_name = 'is_deleted'
  ) then
    alter table sales add column is_deleted boolean not null default false;
  end if;
end $$;

-- Add is_deleted column to expenses if it doesn't exist yet
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'expenses' and column_name = 'is_deleted'
  ) then
    alter table expenses add column is_deleted boolean not null default false;
  end if;
end $$;
