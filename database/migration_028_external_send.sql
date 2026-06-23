-- Migration 028: Add is_external_send column to messages table
-- Marks messages that were sent directly from the WhatsApp App or WhatsApp Web
-- (i.e., fromMe=true but NOT sent by SeuFluxo), so the UI can display "Envio externo".

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_external_send BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.messages.is_external_send IS
  'True when the message was sent externally (via WhatsApp App or WhatsApp Web), '
  'not through SeuFluxo. Used to display the "Envio externo" badge in the chat UI.';

-- Index for potential future filtering
CREATE INDEX IF NOT EXISTS idx_messages_external_send
  ON public.messages (company_id, is_external_send)
  WHERE is_external_send = true;
