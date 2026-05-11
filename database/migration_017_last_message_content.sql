-- ============================================================
-- Migration 017: Last Message Content Preview
-- Adiciona a coluna para armazenar a prévia da última mensagem 
-- enviada ou recebida por um contato, para exibição no Kanban.
-- ============================================================

BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'contacts' 
      AND column_name = 'last_message_content'
    ) THEN
      ALTER TABLE public.contacts ADD COLUMN last_message_content text;
    END IF;
  END
  $$;
COMMIT;
