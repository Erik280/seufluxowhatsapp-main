-- Migration 027: Add signature column to users table
-- The `signature` column may already exist (it was added in a prior schema update).
-- This migration is idempotent and safe to run on any environment.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signature text;

COMMENT ON COLUMN public.users.signature IS
  'Optional signature text shown below the user''s name in WhatsApp messages when the agent enables the signature toggle.';
