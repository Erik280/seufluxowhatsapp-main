-- Migração 006: Biblioteca de Mídia (Media Library)

CREATE TABLE IF NOT EXISTS "public"."media_library" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" uuid NOT NULL,
    "name" text NOT NULL,
    "media_type" text NOT NULL, -- 'audio', 'image', 'video', 'document'
    "url" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE
);

-- RLS
ALTER TABLE "public"."media_library" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own company media" ON "public"."media_library"
  FOR SELECT USING (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own company media" ON "public"."media_library"
  FOR INSERT WITH CHECK (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own company media" ON "public"."media_library"
  FOR DELETE USING (
    company_id = (
      SELECT company_id FROM users WHERE auth_id = auth.uid()
    )
  );
