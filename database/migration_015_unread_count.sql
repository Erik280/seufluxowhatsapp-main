-- ============================================================
-- Migration 015: Unread Messages Counter
-- Adiciona contador de mensagens não lidas na tabela contacts.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;

-- Zerar contador para todos os contatos existentes (já lidos)
UPDATE contacts SET unread_count = 0 WHERE unread_count IS NULL;

-- Verificação
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contacts'
  AND column_name = 'unread_count';
