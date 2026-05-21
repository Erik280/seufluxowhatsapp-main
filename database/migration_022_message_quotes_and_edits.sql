-- Add quoted message support to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_content TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
