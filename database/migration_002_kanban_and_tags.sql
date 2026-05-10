-- ============================================================
-- SeuFluxo WhatsApp — Migração 002: Kanban e Tags
-- Execute este arquivo no SQL Editor do Supabase.
-- ============================================================

-- 1. Criação das Tabelas

CREATE TABLE IF NOT EXISTS kanban_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#8892b0',
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_stages_company ON kanban_stages(company_id);

DROP TRIGGER IF EXISTS trg_kanban_stages_updated ON kanban_stages;
CREATE TRIGGER trg_kanban_stages_updated BEFORE UPDATE ON kanban_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE IF NOT EXISTS tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#00FF88',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_company ON tags(company_id);


CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);


-- 2. Alteração na tabela contacts

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES kanban_stages(id) ON DELETE SET NULL;


-- 3. RLS (Row Level Security)

ALTER TABLE kanban_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Kanban stages read own company" ON kanban_stages
    FOR SELECT USING (company_id = (SELECT company_id FROM users WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Tags read own company" ON tags
    FOR SELECT USING (company_id = (SELECT company_id FROM users WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Contact tags read own company" ON contact_tags
    FOR SELECT USING (
      contact_id IN (SELECT id FROM contacts WHERE company_id = (SELECT company_id FROM users WHERE auth_id = auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 4. Habilitar Supabase Realtime para mensagens e contatos
-- Necessário para o frontend atualizar automaticamente
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE kanban_stages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tags;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 5. Inserir estágios padrão para a empresa raiz (Transforma Futuro)
INSERT INTO kanban_stages (company_id, name, color, order_index)
SELECT '00000000-0000-0000-0000-000000000001', 'Novos Leads', '#00E5CC', 1
WHERE NOT EXISTS (SELECT 1 FROM kanban_stages WHERE company_id = '00000000-0000-0000-0000-000000000001' AND name = 'Novos Leads');

INSERT INTO kanban_stages (company_id, name, color, order_index)
SELECT '00000000-0000-0000-0000-000000000001', 'Em Atendimento', '#00FF88', 2
WHERE NOT EXISTS (SELECT 1 FROM kanban_stages WHERE company_id = '00000000-0000-0000-0000-000000000001' AND name = 'Em Atendimento');

INSERT INTO kanban_stages (company_id, name, color, order_index)
SELECT '00000000-0000-0000-0000-000000000001', 'Fechado', '#8892b0', 3
WHERE NOT EXISTS (SELECT 1 FROM kanban_stages WHERE company_id = '00000000-0000-0000-0000-000000000001' AND name = 'Fechado');
