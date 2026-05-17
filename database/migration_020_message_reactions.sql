-- migration_020_message_reactions.sql
-- Adiciona colunas para suporte a reações e ID do WhatsApp em mensagens

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS whatsapp_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reaction TEXT;

-- Adiciona índice para busca rápida por whatsapp_id para atualizar reações via webhook
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON public.messages(whatsapp_id);
