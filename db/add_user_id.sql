-- ============================================================
-- BizTrack Database Migration: Add user_id column
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- Add user_id column to sales
alter table sales add column if not exists user_id text;

-- Add user_id column to expenses
alter table expenses add column if not exists user_id text;

-- Create indexes for performance when filtering by user_id
create index if not exists idx_sales_user_id on sales (user_id);
create index if not exists idx_expenses_user_id on expenses (user_id);

-- Optional: Update any existing rows to a default user_id if needed,
-- or leave them null so they can be assigned manually or remain unassigned.
-- For example, you can run:
-- update sales set user_id = 'mock-user-id' where user_id is null;
-- update expenses set user_id = 'mock-user-id' where user_id is null;
