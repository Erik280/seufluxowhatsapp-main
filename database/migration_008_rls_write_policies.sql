-- ============================================================
-- Migration 008: Corrigir RLS — Adicionar políticas de escrita
-- para TODAS as tabelas que o frontend precisa manipular.
--
-- PROBLEMA: As policies originais eram apenas FOR SELECT.
-- O frontend autenticado não conseguia INSERT/UPDATE/DELETE.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- CHAT_FLOWS: leitura + escrita para a própria empresa
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Flows insert own company" ON public.chat_flows
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Flows update own company" ON public.chat_flows
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Flows delete own company" ON public.chat_flows
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- FLOW_STEPS: escrita via FK para fluxo da empresa
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Steps insert own company" ON public.flow_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    flow_id IN (
      SELECT id FROM public.chat_flows WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "Steps update own company" ON public.flow_steps
  FOR UPDATE TO authenticated
  USING (
    flow_id IN (
      SELECT id FROM public.chat_flows WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    flow_id IN (
      SELECT id FROM public.chat_flows WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "Steps delete own company" ON public.flow_steps
  FOR DELETE TO authenticated
  USING (
    flow_id IN (
      SELECT id FROM public.chat_flows WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  );

-- ═══════════════════════════════════════════════════════════
-- CONTACTS: escrita para a própria empresa
-- (já existe SELECT policy, mas faltam INSERT/UPDATE/DELETE)
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Contacts insert own company" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Contacts update own company" ON public.contacts
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Contacts delete own company" ON public.contacts
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- MESSAGES: escrita para a própria empresa
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Messages insert own company" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Messages update own company" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- TAGS: leitura + escrita para a própria empresa
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Tags select own company" ON public.tags
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Tags insert own company" ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Tags update own company" ON public.tags
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Tags delete own company" ON public.tags
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- CONTACT_TAGS: escrita (junction table)
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "ContactTags select own" ON public.contact_tags
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT id FROM public.contacts WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "ContactTags insert own" ON public.contact_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT id FROM public.contacts WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "ContactTags delete own" ON public.contact_tags
  FOR DELETE TO authenticated
  USING (
    contact_id IN (
      SELECT id FROM public.contacts WHERE company_id IN (
        SELECT company_id FROM public.users WHERE auth_id = auth.uid()
      )
    )
  );

-- ═══════════════════════════════════════════════════════════
-- MEDIA_LIBRARY: escrita para a própria empresa
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Media select own company" ON public.media_library
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Media insert own company" ON public.media_library
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Media delete own company" ON public.media_library
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- KANBAN_STAGES: leitura + escrita
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Kanban select own company" ON public.kanban_stages
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Kanban insert own company" ON public.kanban_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Kanban update own company" ON public.kanban_stages
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Kanban delete own company" ON public.kanban_stages
  FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════
-- USERS: permitir que o usuário leia/atualize o próprio registro
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Users update own record" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- COMPANIES: admin pode atualizar a própria empresa
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Company update own" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Company select own" ON public.companies
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT company_id FROM public.users WHERE auth_id = auth.uid())
  );
