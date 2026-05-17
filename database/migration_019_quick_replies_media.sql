-- migration_019_quick_replies_media.sql
-- Adiciona suporte a mídias nas respostas rápidas

ALTER TABLE public.quick_replies ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.quick_replies ADD COLUMN IF NOT EXISTS media_type TEXT;
