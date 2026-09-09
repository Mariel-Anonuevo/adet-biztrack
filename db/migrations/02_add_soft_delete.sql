-- Migration: Add is_deleted column for soft delete support
-- Target Database: Supabase / PostgreSQL

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
