-- ============================================================
-- Migration 016: Realtime for Messages and Last Message Update
-- Garante que as mensagens enviadas pela automação apareçam no frontend
-- e atualizem a ordem do contato no chat e kanban.
-- ============================================================

-- Adiciona a tabela messages e contacts na publicação realtime (se ainda não estiver)
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
  END
  $$;
COMMIT;
