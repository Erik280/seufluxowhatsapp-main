-- ============================================================
-- Migration 007: CRM Fields + Flow Builder Extended Step Types
-- + Scheduled Messages + Campaigns
-- Ajustado ao schema real do banco (enums, junction tables, FKs existentes)
-- ============================================================

-- 1. Adicionar campos CRM na tabela contacts (email e notes)
--    Tags já existem via junction table contact_tags → tags
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Adicionar keywords[] em chat_flows
--    trigger_keyword mantido para compatibilidade (NOT NULL no schema atual)
ALTER TABLE public.chat_flows
  ADD COLUMN IF NOT EXISTS keywords    TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Migrar trigger_keyword existente para o array keywords
UPDATE public.chat_flows
SET keywords = ARRAY[trigger_keyword]
WHERE trigger_keyword IS NOT NULL
  AND trigger_keyword != ''
  AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

-- 3. Estender o ENUM step_type_enum com novos tipos
--    (delay = pausa silenciosa, composing = só "digitando...", recording = só "gravando...")
ALTER TYPE public.step_type_enum ADD VALUE IF NOT EXISTS 'delay';
ALTER TYPE public.step_type_enum ADD VALUE IF NOT EXISTS 'composing';
ALTER TYPE public.step_type_enum ADD VALUE IF NOT EXISTS 'recording';

-- 4. Adicionar media_library_id em flow_steps (opcional, para referenciar biblioteca)
ALTER TABLE public.flow_steps
  ADD COLUMN IF NOT EXISTS media_library_id UUID
    REFERENCES public.media_library(id) ON DELETE SET NULL;

-- Tornar content nullable para steps que não têm conteúdo (delay/composing/recording)
ALTER TABLE public.flow_steps
  ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.flow_steps
  ALTER COLUMN content SET DEFAULT '';

-- 5. Índices úteis
CREATE INDEX IF NOT EXISTS idx_chat_flows_keywords   ON public.chat_flows USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_contacts_company_last ON public.contacts(company_id, last_message DESC);

-- ============================================================
-- Tabela: scheduled_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES public.contacts(id)   ON DELETE CASCADE,
  flow_id       UUID             REFERENCES public.chat_flows(id) ON DELETE SET NULL,
  content       TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled | failed
  campaign_id   UUID,                             -- FK adicionada após criar campaigns
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_status    ON public.scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_sched_for       ON public.scheduled_messages(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sched_company   ON public.scheduled_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_sched_contact   ON public.scheduled_messages(contact_id);

-- ============================================================
-- Tabela: campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  -- Filtros de alvo
  target_tag_ids        UUID[] DEFAULT '{}',       -- IDs de tags da tabela tags
  min_inactive_hours    INT DEFAULT 0,
  -- Conteúdo
  message_variants      TEXT[] NOT NULL DEFAULT '{}',
  flow_id               UUID REFERENCES public.chat_flows(id) ON DELETE SET NULL,
  -- Configuração de envio anti-spam
  interval_min_seconds  INT DEFAULT 30,
  interval_max_seconds  INT DEFAULT 120,
  -- Status e controle
  status                TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | running | completed | cancelled
  scheduled_for         TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  total_sent            INT DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_company ON public.campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON public.campaigns(status);

-- FK de scheduled_messages para campaigns (adicionada após criar a tabela)
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT fk_sched_campaign
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- ============================================================
-- RLS para novas tabelas
-- ============================================================
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns          ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (usado pelo backend FastAPI)
CREATE POLICY "service_role_scheduled" ON public.scheduled_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_campaigns" ON public.campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated: acesso apenas à própria empresa
CREATE POLICY "users_own_scheduled" ON public.scheduled_messages
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "users_own_campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );
