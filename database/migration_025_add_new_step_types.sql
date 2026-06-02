-- Migração para adicionar novos tipos de passos suportados no Flow Builder
-- Execute no SQL Editor do Supabase

ALTER TYPE step_type_enum ADD VALUE IF NOT EXISTS 'delay';
ALTER TYPE step_type_enum ADD VALUE IF NOT EXISTS 'composing';
ALTER TYPE step_type_enum ADD VALUE IF NOT EXISTS 'recording';
ALTER TYPE step_type_enum ADD VALUE IF NOT EXISTS 'react';
ALTER TYPE step_type_enum ADD VALUE IF NOT EXISTS 'document';
