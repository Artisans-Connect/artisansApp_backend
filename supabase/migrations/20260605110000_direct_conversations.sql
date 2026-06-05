-- Direct enquiry chats between clients and workers, separate from job bookings.
CREATE TABLE IF NOT EXISTS direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id, worker_id)
);

ALTER TABLE direct_conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'direct_conversations'
      AND policyname = 'Participants can view direct conversations'
  ) THEN
    CREATE POLICY "Participants can view direct conversations"
      ON direct_conversations FOR SELECT
      USING (auth.uid() = client_id OR auth.uid() = worker_id);
  END IF;
END $$;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES direct_conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'Direct conversation participants can view messages'
  ) THEN
    CREATE POLICY "Direct conversation participants can view messages"
      ON messages FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM direct_conversations c
          WHERE c.id = messages.conversation_id
            AND (c.client_id = auth.uid() OR c.worker_id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'Direct conversation participants can insert messages'
  ) THEN
    CREATE POLICY "Direct conversation participants can insert messages"
      ON messages FOR INSERT
      WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
          SELECT 1 FROM direct_conversations c
          WHERE c.id = messages.conversation_id
            AND (c.client_id = auth.uid() OR c.worker_id = auth.uid())
        )
      );
  END IF;
END $$;
