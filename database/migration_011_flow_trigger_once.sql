-- ============================================================
-- SeuFluxo WhatsApp — Migration 011
-- Adiciona funcionalidade de disparar fluxos apenas uma vez
-- ============================================================

-- 1. Adicionar flag trigger_once na tabela de fluxos
ALTER TABLE public.chat_flows
  ADD COLUMN IF NOT EXISTS trigger_once BOOLEAN NOT NULL DEFAULT false;

-- 2. Adicionar array de fluxos completados na tabela de contatos
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS completed_flows UUID[] NOT NULL DEFAULT '{}'::UUID[];

-- 3. Criar índice para performance em buscas de contatos
-- Um índice GIN sobre completed_flows pode ser útil no futuro se for necessário
CREATE INDEX IF NOT EXISTS idx_contacts_completed_flows ON public.contacts USING GIN (completed_flows);
