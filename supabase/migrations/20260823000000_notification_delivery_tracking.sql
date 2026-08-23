CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('fcm', 'whatsapp', 'sms')),
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failure_reason text,
  provider_message_id text
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
  ON notification_deliveries (notification_id, attempted_at DESC);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS fallback_after timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
