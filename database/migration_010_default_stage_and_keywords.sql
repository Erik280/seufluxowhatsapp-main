-- ============================================================
-- Migration 010: Default Stage + Entry Keywords Routing
-- ============================================================

-- 1. Adicionar colunas na tabela kanban_stages
ALTER TABLE public.kanban_stages
  ADD COLUMN IF NOT EXISTS is_default    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_protected  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_keywords TEXT[]  NOT NULL DEFAULT '{}';

-- 2. Índice para busca rápida de stages com keywords
CREATE INDEX IF NOT EXISTS idx_kanban_stages_entry_keywords
  ON public.kanban_stages USING GIN(entry_keywords);

-- 3. Garantir que cada empresa tenha exatamente 1 stage padrão.
--    Este script cria o stage 'NOVOS LEADS' para empresas que ainda não têm.
--    (Idempotente: só insere se não existir nenhum is_default=true para a empresa)
INSERT INTO public.kanban_stages (company_id, name, color, order_index, is_default, is_protected)
SELECT
  c.id AS company_id,
  'NOVOS LEADS' AS name,
  '#00E5CC'     AS color,
  0             AS order_index,
  true          AS is_default,
  true          AS is_protected
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_stages ks
  WHERE ks.company_id = c.id AND ks.is_default = true
);

-- 4. Para empresas que já tinham a coluna 'NOVOS LEADS' (criada manualmente),
--    marcar como padrão e protegida a primeira coluna de cada empresa com esse nome.
UPDATE public.kanban_stages
SET is_default   = true,
    is_protected = true
WHERE id IN (
  SELECT DISTINCT ON (company_id) id
  FROM public.kanban_stages
  WHERE LOWER(name) LIKE '%novos leads%'
    AND is_default = false
  ORDER BY company_id, order_index ASC
);

-- ============================================================
-- Verificação:
-- SELECT company_id, name, is_default, is_protected, entry_keywords FROM kanban_stages ORDER BY company_id, order_index;
-- ============================================================
