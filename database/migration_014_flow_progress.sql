-- ============================================================
-- Migration 014: Flow Progress Tracking on Contacts
-- Adiciona campos para rastrear o progresso do fluxo ativo
-- de automação de um contato no Kanban.
-- ============================================================

-- Adiciona referência ao fluxo que está em andamento
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS flow_current_flow_id uuid REFERENCES chat_flows(id) ON DELETE SET NULL;

-- Adiciona índice do step atual (0-based). NULL = sem fluxo ativo.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS flow_current_step_index integer DEFAULT NULL;

-- Políticas RLS — herdadas (sem nova tabela, só novos campos).
-- O UPDATE já é coberto pela política existente de escrita em contacts.

-- Verificação
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contacts'
  AND column_name IN ('flow_current_flow_id', 'flow_current_step_index');
