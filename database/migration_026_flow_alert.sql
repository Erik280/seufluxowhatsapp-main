-- migration_026_flow_alert.sql
-- Adiciona campos de alerta de fluxo incompleto na tabela contacts
-- Ativados quando o bot_engine esgota as tentativas de retry ao enviar uma mídia/mensagem

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS flow_alert         BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flow_alert_step    TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flow_alert_message TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flow_failed_at     TIMESTAMPTZ   DEFAULT NULL;

-- Índice para facilitar busca de contatos com alerta ativo
CREATE INDEX IF NOT EXISTS idx_contacts_flow_alert
  ON contacts (company_id, flow_alert)
  WHERE flow_alert = TRUE;

-- Comentários descritivos
COMMENT ON COLUMN contacts.flow_alert         IS 'TRUE quando o fluxo automático falhou e precisa de intervenção humana';
COMMENT ON COLUMN contacts.flow_alert_step    IS 'Tipo do step que falhou (ex: video, audio, image)';
COMMENT ON COLUMN contacts.flow_alert_message IS 'Mensagem do último erro retornado pela Evolution API';
COMMENT ON COLUMN contacts.flow_failed_at     IS 'Data/hora em que o fluxo falhou';
