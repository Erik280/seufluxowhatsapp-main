-- ============================================================
-- SeuFluxo WhatsApp — Migração 004: Correção de RLS (Recursão)
-- Execute este arquivo no SQL Editor do Supabase.
-- ============================================================

-- 1. Remove a política que estava causando loop infinito (Erro 500)
DROP POLICY IF EXISTS "Users read own company" ON users;

-- 2. Cria uma política segura: O usuário sempre pode ler o próprio registro
CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (
    auth_id = auth.uid()
  );

-- 3. (Opcional para o futuro) Se precisarmos listar outros membros da equipe na aba "Equipe",
-- usaremos uma View ou Função com SECURITY DEFINER para evitar a recursão na mesma tabela.
