-- Agent Logs Table
-- This file creates the agent_logs table for storing agent execution logs

CREATE TABLE IF NOT EXISTS agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL,
    log_level VARCHAR(20) NOT NULL DEFAULT 'info', -- info, warn, error, debug
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_logs_session_created 
ON agent_logs(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_created 
ON agent_logs(agent_id, created_at DESC);
