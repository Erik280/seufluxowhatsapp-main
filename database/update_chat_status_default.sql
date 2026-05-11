-- ============================================================
-- SeuFluxo WhatsApp — Atualizar status padrão para Humano
-- Rode este script no SQL Editor do Supabase
-- ============================================================

-- 1. Altera o valor padrão da coluna chat_status para 'human' nas futuras criações
ALTER TABLE public.contacts ALTER COLUMN chat_status SET DEFAULT 'human';

-- 2. Atualiza TODOS os contatos existentes de todas as empresas para 'human'
UPDATE public.contacts SET chat_status = 'human';
