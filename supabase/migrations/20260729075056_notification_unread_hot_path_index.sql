CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_unread
  ON notifications (tenant_id, user_id, created_at DESC)
  WHERE is_read = false;
