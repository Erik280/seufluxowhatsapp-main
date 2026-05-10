-- ============================================================
-- SeuFluxo WhatsApp — Migração: Adiciona tipo 'video' ao enum
-- Execute APENAS este arquivo no SQL Editor do Supabase.
-- NÃO rode o init_schema.sql novamente.
-- ============================================================

ALTER TYPE step_type_enum ADD VALUE IF NOT EXISTS 'video';
