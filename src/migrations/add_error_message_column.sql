-- Add error_message column to agent_sessions table
-- This column stores error details when sessions fail
-- Date: 2025-06-29
-- Context: Agent error handling improvement

ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Update migration log (if you have one)
-- INSERT INTO schema_migrations (version, applied_at) VALUES ('20250629_add_error_message', NOW());

COMMENT ON COLUMN agent_sessions.error_message IS 'Stores error details when an agent session fails';
