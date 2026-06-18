-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- SALES TABLE
create table if not exists sales (
  id          bigserial primary key,
  date        date not null,
  description text not null,
  category    text not null,
  amount      numeric(12, 2) not null,
  receipt     text,
  created_at  timestamptz default now()
);

-- EXPENSES TABLE
create table if not exists expenses (
  id          bigserial primary key,
  date        date not null,
  description text not null,
  category    text not null,
  vendor      text not null,
  amount      numeric(12, 2) not null,
  created_at  timestamptz default now()
);

-- Enable Row Level Security (optional but recommended)
alter table sales    enable row level security;
alter table expenses enable row level security;

-- Allow all operations for now (you can restrict later per user)
create policy "Allow all on sales"    on sales    for all using (true);
create policy "Allow all on expenses" on expenses for all using (true);

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
