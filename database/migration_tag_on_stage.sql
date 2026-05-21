-- ================================================================
-- Migration: Adiciona automação de tags por estágio Kanban
-- Execute no Supabase > SQL Editor
-- ================================================================

ALTER TABLE kanban_stages
ADD COLUMN IF NOT EXISTS tag_ids_to_add TEXT[] DEFAULT '{}';

COMMENT ON COLUMN kanban_stages.tag_ids_to_add IS
  'IDs das tags que serão adicionadas automaticamente ao lead quando ele entrar neste estágio.';
