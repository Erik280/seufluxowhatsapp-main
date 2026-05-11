-- migration_013_quick_replies.sql
-- Adiciona tabela de respostas rápidas (quick replies) e políticas de RLS

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Evitar que a mesma empresa tenha atalhos duplicados
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_company_shortcut ON public.quick_replies (company_id, shortcut);

-- Habilitar RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- Política de visualização (SELECT)
CREATE POLICY "Users can view quick replies of their company"
  ON public.quick_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.company_id = quick_replies.company_id
    )
  );

-- Política de inserção (INSERT)
CREATE POLICY "Users can insert quick replies for their company"
  ON public.quick_replies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.company_id = quick_replies.company_id
    )
  );

-- Política de atualização (UPDATE)
CREATE POLICY "Users can update quick replies of their company"
  ON public.quick_replies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.company_id = quick_replies.company_id
    )
  );

-- Política de exclusão (DELETE)
CREATE POLICY "Users can delete quick replies of their company"
  ON public.quick_replies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.company_id = quick_replies.company_id
    )
  );
