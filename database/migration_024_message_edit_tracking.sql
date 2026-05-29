-- migration_024: Rastreamento completo de edição de mensagens
-- Complementa migration_022 que adicionou is_edited

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_content TEXT;

-- Garantir que is_edited existe (caso a migration_022 não tenha rodado ainda)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN messages.is_edited IS 'True quando o lead editou a mensagem após o envio';
COMMENT ON COLUMN messages.edited_at IS 'Timestamp da última edição da mensagem';
COMMENT ON COLUMN messages.original_content IS 'Conteúdo original antes da primeira edição';
