-- ============================================================
-- SeuFluxo WhatsApp — Migração 003: Gatilhos de Kanban
-- Execute este arquivo no SQL Editor do Supabase.
-- ============================================================

-- Adiciona a coluna para vincular um fluxo de automação a um estágio do Kanban
ALTER TABLE kanban_stages 
ADD COLUMN IF NOT EXISTS trigger_flow_id UUID REFERENCES chat_flows(id) ON DELETE SET NULL;

-- Atualizar políticas de leitura para administradores se necessário
-- (As políticas existentes já cobrem isso, pois é apenas uma coluna extra)
