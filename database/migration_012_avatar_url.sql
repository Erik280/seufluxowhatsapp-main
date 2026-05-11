-- migration_012_avatar_url.sql
-- Adiciona colunas para thumbnail de perfil otimizado

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para encontrar rapidamente contatos sem avatar ou com avatar antigo
CREATE INDEX IF NOT EXISTS idx_contacts_avatar_updated_at
  ON contacts (avatar_updated_at ASC NULLS FIRST);

COMMENT ON COLUMN contacts.avatar_url        IS 'URL do thumbnail WebP 128x128 no MinIO';
COMMENT ON COLUMN contacts.avatar_updated_at IS 'Última vez que o avatar foi sincronizado com a Evolution API';
