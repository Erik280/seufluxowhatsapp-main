-- ============================================================
-- SeuFluxo WhatsApp — Migração 005: RLS para Companies
-- Execute este arquivo no SQL Editor do Supabase.
-- ============================================================

-- Permite que usuários leiam os dados da própria empresa
CREATE POLICY "Users read own company data" ON companies
  FOR SELECT USING (
    id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Permite que usuários atualizem os dados da própria empresa (necessário para salvar a instância do WhatsApp)
CREATE POLICY "Users update own company data" ON companies
  FOR UPDATE USING (
    id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );
