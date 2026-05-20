-- 1. Ativar extensão pgvector para permitir buscas semânticas (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Criar a Tabela "Base de Conhecimento" (Knowledge Base)
CREATE TABLE IF NOT EXISTS company_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- Padrão de tamanho para embeddings de texto
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Políticas de Segurança (RLS) para a Base de Conhecimento
ALTER TABLE company_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company knowledge" 
    ON company_knowledge FOR SELECT 
    USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can insert their company knowledge" 
    ON company_knowledge FOR INSERT 
    WITH CHECK (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can update their company knowledge" 
    ON company_knowledge FOR UPDATE 
    USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can delete their company knowledge" 
    ON company_knowledge FOR DELETE 
    USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));

-- 3. Melhorias no Kanban: Permitir IA gerenciar etapas específicas
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS is_ai_managed BOOLEAN DEFAULT false;
ALTER TABLE kanban_stages ADD COLUMN IF NOT EXISTS ai_instructions TEXT;

-- 4. Melhorias na Biblioteca de Mídia: Adicionar "visão" da IA sobre os arquivos
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS ai_description TEXT;

-- 5. Melhorias em Mensagens: Campo para salvar transcrição de Áudios/Vídeos
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcribed_text TEXT;

-- 6. Tabela de Sumarização de Contexto (Transferência Humano -> Bot)
CREATE TABLE IF NOT EXISTS contact_ai_context (
    contact_id UUID PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    last_human_summary TEXT, -- Onde o modelo vai salvar o resumo da intervenção humana
    last_summary_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS para contact_ai_context
ALTER TABLE contact_ai_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view context" ON contact_ai_context FOR SELECT USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can insert context" ON contact_ai_context FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can update context" ON contact_ai_context FOR UPDATE USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can delete context" ON contact_ai_context FOR DELETE USING (company_id IN (SELECT company_id FROM users WHERE auth_id = auth.uid()));
