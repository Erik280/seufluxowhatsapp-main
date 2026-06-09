-- =====================================================
-- Migration 027: Attendance Sessions and Bot Triage
-- Executar no SQL Editor do Supabase
-- =====================================================

-- 1. Create table attendance_sessions
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_company_id ON public.attendance_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_contact_id ON public.attendance_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_user_id ON public.attendance_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_department_id ON public.attendance_sessions(department_id);

-- 2. Alter table flow_steps
ALTER TABLE public.flow_steps
  ADD COLUMN IF NOT EXISTS transfer_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3. RLS para attendance_sessions
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Política de leitura: qualquer usuário da empresa pode ler (para o CRM)
DROP POLICY IF EXISTS "attendance_sessions_select_company" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_select_company" ON public.attendance_sessions
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_id = auth.uid()
    )
  );

-- Política de inserção: qualquer usuário da empresa (via backend/service role, mas bom garantir)
DROP POLICY IF EXISTS "attendance_sessions_insert_company" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_insert_company" ON public.attendance_sessions
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_id = auth.uid()
    )
  );

-- Política de update: apenas quem atende ou admins
DROP POLICY IF EXISTS "attendance_sessions_update_company" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_update_company" ON public.attendance_sessions
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.users WHERE auth_id = auth.uid()
    )
  );
