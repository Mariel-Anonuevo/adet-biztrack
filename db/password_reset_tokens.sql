-- ============================================================
-- BizTrack: Password Reset Tokens Table
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

create table if not exists password_reset_tokens (
  id          bigserial primary key,
  email       text not null,
  token_hash  text not null unique,        -- bcrypt hash of the raw token
  expires_at  timestamptz not null,        -- 30-minute window
  used        boolean not null default false,
  created_at  timestamptz default now()
);

-- Index for fast lookup by email
create index if not exists idx_prt_email on password_reset_tokens (email);

-- Enable Row Level Security (no public access — server uses service_role key)
alter table password_reset_tokens enable row level security;

-- Deny all direct client-side access
create policy "No public access to reset tokens"
  on password_reset_tokens
  for all
  using (false);
