-- =====================================================
-- Migration 026: Multiatendimento (Departamentos + RBAC)
-- Executar no SQL Editor do Supabase
-- =====================================================

-- 1. Adicionar limite de licenças às empresas
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 5;

-- 2. Criar tabela de departamentos
CREATE TABLE IF NOT EXISTS public.departments (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice para busca por empresa
CREATE INDEX IF NOT EXISTS idx_departments_company_id ON public.departments(company_id);

-- 3. Adicionar department_id e signature à tabela users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signature text;

-- 4. Adicionar department_id à tabela contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- 5. Adicionar 'manager' ao enum user_role_enum
-- ATENÇÃO: O enum no banco se chama 'user_role_enum' (não 'user_role')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'manager'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_enum')
  ) THEN
    ALTER TYPE user_role_enum ADD VALUE 'manager';
  END IF;
END $$;

-- 6. RLS para departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Política de leitura: qualquer usuário da empresa pode ler
DROP POLICY IF EXISTS "departments_select_company" ON public.departments;
CREATE POLICY "departments_select_company" ON public.departments
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_id = auth.uid()
    )
  );

-- Política de escrita: apenas admin pode inserir
DROP POLICY IF EXISTS "departments_insert_admin" ON public.departments;
CREATE POLICY "departments_insert_admin" ON public.departments
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Política de update: apenas admin
DROP POLICY IF EXISTS "departments_update_admin" ON public.departments;
CREATE POLICY "departments_update_admin" ON public.departments
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Política de delete: apenas admin
DROP POLICY IF EXISTS "departments_delete_admin" ON public.departments;
CREATE POLICY "departments_delete_admin" ON public.departments
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.users
      WHERE auth_id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- Verificação final — rode depois para confirmar:
-- =====================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name IN ('companies', 'users', 'contacts', 'departments')
--   AND column_name IN ('max_users', 'department_id', 'signature')
--   ORDER BY table_name, column_name;
--
-- SELECT enumlabel FROM pg_enum
--   WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_enum');
