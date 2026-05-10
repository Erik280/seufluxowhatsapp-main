-- ============================================================
-- SeuFluxo WhatsApp — Criação do Usuário Gavinacao
-- 1. PRIMEIRO: Crie a conta "gavinacao@gmail.com" no painel Authentication do Supabase!
-- 2. SEGUNDO: Cole este script no SQL Editor do Supabase e clique em RUN.
-- ============================================================

DO $$
DECLARE
  new_company_id uuid;
  target_auth_id uuid;
BEGIN
  -- 1. Pega o ID de autenticação do usuário gavinacao (que você já criou no painel Auth)
  SELECT id INTO target_auth_id 
  FROM auth.users 
  WHERE email = 'gavinacao@gmail.com';

  IF target_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado na tabela auth.users. Crie ele no painel do Supabase primeiro!';
  END IF;

  -- 2. Limpa qualquer registro antigo caso tenha dado erro antes
  DELETE FROM public.users WHERE email = 'gavinacao@gmail.com';

  -- 3. Cria a nova empresa do Gavinacao
  INSERT INTO public.companies (name) 
  VALUES ('Empresa Gavinacao') 
  RETURNING id INTO new_company_id;

  -- 4. Cria o registro na tabela pública vinculando a empresa como admin
  -- Ser 'admin' garante que o menu de Configurações da Empresa, QR Code, Fluxos e Kanban apareçam.
  INSERT INTO public.users (
    id, 
    auth_id, 
    company_id, 
    email, 
    name, 
    role
  )
  VALUES (
    gen_random_uuid(), 
    target_auth_id, 
    new_company_id, 
    'gavinacao@gmail.com', 
    'Admin Gavinacao', 
    'admin'
  );

END $$;
