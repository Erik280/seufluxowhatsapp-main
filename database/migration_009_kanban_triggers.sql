-- ============================================================
-- Migration 009: Kanban Stage Automation Triggers
-- Adiciona suporte a automação de fluxo ao mover um lead
-- para uma coluna específica do Kanban.
-- ============================================================

-- 1. Adicionar colunas na tabela kanban_stages
ALTER TABLE public.kanban_stages
  ADD COLUMN IF NOT EXISTS is_trigger_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trigger_flow_id UUID REFERENCES public.chat_flows(id) ON DELETE SET NULL;

-- 2. Índice para lookup rápido por trigger
CREATE INDEX IF NOT EXISTS idx_kanban_stages_trigger
  ON public.kanban_stages(trigger_flow_id)
  WHERE trigger_flow_id IS NOT NULL;

-- ============================================================
-- Verificação: rode depois para confirmar
-- SELECT id, name, is_trigger_enabled, trigger_flow_id FROM kanban_stages;
-- ============================================================
