-- Migração 018: Supabase Storage para Mídias de Leads
-- Adiciona colunas para rastrear o path no Storage e a data de expiração
-- media_url      → Signed URL temporária (7 dias) gerada pelo Supabase Storage
-- media_storage_path → Path real do arquivo no bucket 'lead-media' (para deleção pelo cron)
-- media_expires_at   → Timestamp de expiração (now() + 7 dias) — usado pelo cron de limpeza

-- 1. Adicionar colunas novas na tabela messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS media_expires_at   TIMESTAMP WITH TIME ZONE;

-- 2. Índice para o cron job encontrar rápido os arquivos expirados
CREATE INDEX IF NOT EXISTS idx_messages_media_expires_at
  ON public.messages (media_expires_at)
  WHERE media_expires_at IS NOT NULL AND media_storage_path IS NOT NULL;

-- 3. Comentários explicativos
COMMENT ON COLUMN public.messages.media_storage_path IS
  'Path do arquivo no bucket lead-media do Supabase Storage. Ex: {company_id}/2024-01-15/audio/{message_id}.ogg';

COMMENT ON COLUMN public.messages.media_expires_at IS
  'Data/hora em que o arquivo de mídia expira e deve ser deletado do Supabase Storage (TTL = 7 dias).';

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA: Configurar o bucket 'lead-media' no Dashboard do Supabase:
--
-- 1. Acesse: Storage → New Bucket
--    - Name: lead-media
--    - Public: OFF (privado — acessado apenas via Signed URL)
--    - File size limit: 50MB
--
-- 2. Em Storage → Policies → lead-media, adicione policy de service role:
--    (O backend usa SERVICE_ROLE_KEY que bypassa RLS, então não é necessário
--     criar policies explícitas para o bucket, mas é boa prática definir
--     que apenas a service role pode ler/escrever/deletar)
--
-- O bucket é criado automaticamente pelo LeadMediaStorage._ensure_bucket()
-- na primeira vez que uma mídia é recebida.
-- ─────────────────────────────────────────────────────────────────────────────
