-- ============================================================
-- SeuFluxo WhatsApp — Schema Inicial (Supabase)
-- Execute este SQL no SQL Editor do painel Supabase.
-- ============================================================

-- ========================
-- 1. TIPOS ENUMERADOS
-- ========================

CREATE TYPE chat_status_enum AS ENUM ('bot', 'human');
CREATE TYPE user_role_enum   AS ENUM ('superadmin', 'admin', 'agent');
CREATE TYPE message_dir_enum AS ENUM ('in', 'out');
CREATE TYPE step_type_enum   AS ENUM ('text', 'audio', 'image');


-- ========================
-- 2. TABELAS
-- ========================

-- ── COMPANIES ──────────────────────────────────────────────
CREATE TABLE companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  evolution_instance TEXT,          -- nome da instância na Evolution API
  evolution_apikey   TEXT,          -- apikey da instância
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── USERS (vinculados ao Supabase Auth) ────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE,          -- auth.users.id do Supabase Auth
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  role        user_role_enum NOT NULL DEFAULT 'agent',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_auth    ON users(auth_id);

-- ── CONTACTS ───────────────────────────────────────────────
CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone        TEXT NOT NULL,
  name         TEXT,
  profile_pic  TEXT,                 -- URL do avatar (MinIO)
  chat_status  chat_status_enum NOT NULL DEFAULT 'bot',
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, phone)          -- mesmo telefone só uma vez por empresa
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_phone   ON contacts(phone);
CREATE INDEX idx_contacts_status  ON contacts(chat_status);

-- ── CHAT FLOWS ─────────────────────────────────────────────
CREATE TABLE chat_flows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  trigger_keyword  TEXT NOT NULL,     -- palavra-chave que dispara o fluxo
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flows_company ON chat_flows(company_id);
CREATE INDEX idx_flows_keyword ON chat_flows(trigger_keyword);

-- ── FLOW STEPS ─────────────────────────────────────────────
CREATE TABLE flow_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        UUID NOT NULL REFERENCES chat_flows(id) ON DELETE CASCADE,
  type           step_type_enum NOT NULL DEFAULT 'text',
  content        TEXT NOT NULL,        -- texto, URL do áudio ou imagem
  delay_duration INT NOT NULL DEFAULT 3,  -- segundos de espera (simula humano)
  order_index    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_steps_flow  ON flow_steps(flow_id);
CREATE INDEX idx_steps_order ON flow_steps(flow_id, order_index);

-- ── MESSAGES ───────────────────────────────────────────────
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction   message_dir_enum NOT NULL,  -- 'in' = recebida, 'out' = enviada
  content     TEXT,
  media_url   TEXT,                        -- URL do arquivo no MinIO
  media_type  TEXT,                        -- mime type
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_company ON messages(company_id);
CREATE INDEX idx_messages_contact ON messages(contact_id);
CREATE INDEX idx_messages_time    ON messages(created_at DESC);


-- ========================
-- 3. TRIGGERS DE UPDATED_AT
-- ========================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_flows_updated BEFORE UPDATE ON chat_flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========================
-- 4. RLS (Row Level Security)
-- ========================

ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages   ENABLE ROW LEVEL SECURITY;

-- Política para leitura: usuários só veem dados da própria empresa
CREATE POLICY "Users read own company" ON users
  FOR SELECT USING (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Contacts read own company" ON contacts
  FOR SELECT USING (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Flows read own company" ON chat_flows
  FOR SELECT USING (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Steps read own company" ON flow_steps
  FOR SELECT USING (
    flow_id IN (
      SELECT id FROM chat_flows WHERE company_id = (
        SELECT company_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "Messages read own company" ON messages
  FOR SELECT USING (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Superadmins podem ler todas as empresas
CREATE POLICY "Superadmin reads all companies" ON companies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid() AND role = 'superadmin'
    )
  );


-- ========================
-- 5. DADOS INICIAIS (SEED)
-- ========================

-- Empresa raiz
INSERT INTO companies (id, name) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Transforma Futuro'
);

-- Usuário admin root (o auth_id será preenchido após o registro no Supabase Auth)
INSERT INTO users (id, company_id, email, name, role) VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'eriklima.me@gmail.com',
  'Erik Lima',
  'superadmin'
);

-- Fluxo de boas-vindas de exemplo
INSERT INTO chat_flows (id, company_id, name, trigger_keyword, is_active) VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000001',
  'Boas-vindas',
  'oi',
  true
);

INSERT INTO flow_steps (flow_id, type, content, delay_duration, order_index) VALUES
  ('00000000-0000-0000-0000-000000000100', 'text', 'Olá! 👋 Seja bem-vindo à *Transforma Futuro*!', 2, 1),
  ('00000000-0000-0000-0000-000000000100', 'text', 'Sou o assistente virtual e estou aqui para te ajudar. Como posso te atender hoje?', 4, 2),
  ('00000000-0000-0000-0000-000000000100', 'text', '📋 Escolha uma opção:\n\n1️⃣ Conhecer nossos serviços\n2️⃣ Falar com um atendente\n3️⃣ Suporte técnico', 3, 3);
