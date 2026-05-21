-- ================================================================
-- Migration 023: AI Agent Setup + Índice pgvector HNSW
-- STANDALONE: inclui tudo do migration_021 + índices otimizados.
-- Execute este arquivo no Supabase SQL Editor (ordem única).
-- ================================================================

-- PASSO 1: Ativar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- PASSO 2: Tabela de Base de Conhecimento (RAG)
CREATE TABLE IF NOT EXISTS company_knowledge (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    content     TEXT         NOT NULL,
    embedding   VECTOR(1536),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE company_knowledge ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_knowledge' AND policyname='knowledge_select') THEN
    CREATE POLICY "knowledge_select" ON company_knowledge FOR SELECT
        USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_knowledge' AND policyname='knowledge_insert') THEN
    CREATE POLICY "knowledge_insert" ON company_knowledge FOR INSERT
        WITH CHECK (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_knowledge' AND policyname='knowledge_update') THEN
    CREATE POLICY "knowledge_update" ON company_knowledge FOR UPDATE
        USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='company_knowledge' AND policyname='knowledge_delete') THEN
    CREATE POLICY "knowledge_delete" ON company_knowledge FOR DELETE
        USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
END $$;

-- PASSO 3: Campos de IA no Kanban
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS is_ai_managed   BOOLEAN DEFAULT false;
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS ai_instructions TEXT;

-- PASSO 4: Campo de transcrição em mensagens
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcribed_text TEXT;

-- PASSO 5: Tabela de contexto IA por contato
CREATE TABLE IF NOT EXISTS contact_ai_context (
    contact_id         UUID PRIMARY KEY REFERENCES contacts(id)  ON DELETE CASCADE,
    company_id         UUID             REFERENCES companies(id) ON DELETE CASCADE,
    last_human_summary TEXT,
    last_summary_date  TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE contact_ai_context ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_ai_context' AND policyname='ai_ctx_select') THEN
    CREATE POLICY "ai_ctx_select" ON contact_ai_context FOR SELECT
        USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_ai_context' AND policyname='ai_ctx_insert') THEN
    CREATE POLICY "ai_ctx_insert" ON contact_ai_context FOR INSERT
        WITH CHECK (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_ai_context' AND policyname='ai_ctx_update') THEN
    CREATE POLICY "ai_ctx_update" ON contact_ai_context FOR UPDATE
        USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_ai_context' AND policyname='ai_ctx_delete') THEN
    CREATE POLICY "ai_ctx_delete" ON contact_ai_context FOR DELETE
        USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
  END IF;
END $$;

-- PASSO 6: Índice HNSW para buscas semânticas rápidas
CREATE INDEX IF NOT EXISTS company_knowledge_embedding_idx
    ON company_knowledge
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- PASSO 7: Índices auxiliares
CREATE INDEX IF NOT EXISTS contact_ai_context_contact_idx ON contact_ai_context (contact_id);
CREATE INDEX IF NOT EXISTS contact_ai_context_company_idx ON contact_ai_context (company_id);

-- PASSO 8: Função de busca semântica
CREATE OR REPLACE FUNCTION match_knowledge(
    p_company_id      UUID,
    p_query_embedding VECTOR(1536),
    p_match_count     INT DEFAULT 5
)
RETURNS TABLE (
    id         UUID,
    title      VARCHAR,
    content    TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ck.id,
        ck.title,
        ck.content,
        1 - (ck.embedding <=> p_query_embedding) AS similarity
    FROM company_knowledge ck
    WHERE ck.company_id = p_company_id
      AND ck.embedding IS NOT NULL
    ORDER BY ck.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_knowledge TO service_role;
GRANT EXECUTE ON FUNCTION match_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION match_knowledge TO anon;
