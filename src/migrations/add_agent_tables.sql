-- Agent System Database Schema Extensions
-- This file creates the necessary tables for the VSI Agent System

-- Agent sessions
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    research_topic TEXT NOT NULL,
    preferences JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'created',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP NULL
);

-- Individual agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    agent_type VARCHAR(100) NOT NULL,
    agent_id VARCHAR(255) UNIQUE NOT NULL,
    config JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'initialized',
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent memory
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(255) NOT NULL,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE NULL,
    memory_key VARCHAR(255) NOT NULL,
    memory_value JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(agent_id, memory_key)
);

-- Agent artifacts
CREATE TABLE IF NOT EXISTS agent_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL,
    artifact_name VARCHAR(255) NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent tasks
CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL,
    task_type VARCHAR(100) NOT NULL,
    task_data JSONB NOT NULL,
    dependencies TEXT[] DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    assigned_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    result JSONB NULL
);

-- Agent messages (inter-agent communication)
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    from_agent VARCHAR(255) NOT NULL,
    to_agent VARCHAR(255) NULL, -- NULL for broadcast
    message_type VARCHAR(100) NOT NULL,
    message_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP NULL
);

-- Agent feedback
CREATE TABLE IF NOT EXISTS agent_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NULL,
    artifact_id UUID REFERENCES agent_artifacts(id) ON DELETE CASCADE NULL,
    feedback_type VARCHAR(100) NOT NULL,
    feedback_data JSONB NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP NULL
);

-- Agent knowledge (cross-session user knowledge)
CREATE TABLE IF NOT EXISTS agent_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    knowledge_key VARCHAR(255) NOT NULL,
    knowledge_value JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, knowledge_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_agents_session_id ON agents(session_id);
CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type);

CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_id ON agent_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_session_id ON agent_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_key ON agent_memory(memory_key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_expires_at ON agent_memory(expires_at);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_session_id ON agent_artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_agent_id ON agent_artifacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_type ON agent_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_status ON agent_artifacts(status);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_session_id ON agent_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_from_agent ON agent_messages(from_agent);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to_agent ON agent_messages(to_agent);
CREATE INDEX IF NOT EXISTS idx_agent_messages_type ON agent_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_session_id ON agent_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_user_id ON agent_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_status ON agent_feedback(status);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_user_id ON agent_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_key ON agent_knowledge(knowledge_key);

-- Create views for common queries
CREATE OR REPLACE VIEW agent_session_summary AS
SELECT 
    s.id,
    s.user_id,
    s.research_topic,
    s.status,
    s.created_at,
    s.updated_at,
    s.completed_at,
    COUNT(a.id) as agent_count,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_agents,
    COUNT(ar.id) as artifact_count,
    AVG(CASE WHEN a.completed_at IS NOT NULL AND a.started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (a.completed_at - a.started_at)) 
        END) as avg_agent_duration_seconds
FROM agent_sessions s
LEFT JOIN agents a ON s.id = a.session_id
LEFT JOIN agent_artifacts ar ON s.id = ar.session_id
GROUP BY s.id, s.user_id, s.research_topic, s.status, s.created_at, s.updated_at, s.completed_at;

-- Function to cleanup expired memory
CREATE OR REPLACE FUNCTION cleanup_expired_agent_memory()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM agent_memory 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get session progress
CREATE OR REPLACE FUNCTION get_session_progress(session_uuid UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'session_id', s.id,
        'status', s.status,
        'overall_progress', CASE 
            WHEN COUNT(a.id) = 0 THEN 0
            ELSE ROUND((COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::FLOAT / COUNT(a.id)) * 100)
        END,
        'agents', json_agg(
            json_build_object(
                'agent_id', a.agent_id,
                'type', a.agent_type,
                'status', a.status,
                'started_at', a.started_at,
                'completed_at', a.completed_at
            )
        ),
        'artifacts', (
            SELECT json_agg(
                json_build_object(
                    'id', ar.id,
                    'type', ar.artifact_type,
                    'name', ar.artifact_name,
                    'status', ar.status,
                    'created_at', ar.created_at
                )
            )
            FROM agent_artifacts ar 
            WHERE ar.session_id = s.id
        )
    ) INTO result
    FROM agent_sessions s
    LEFT JOIN agents a ON s.id = a.session_id
    WHERE s.id = session_uuid
    GROUP BY s.id, s.status;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update agent_sessions.updated_at when agents change
CREATE OR REPLACE FUNCTION update_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agent_sessions 
    SET updated_at = NOW() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_on_agent_change
    AFTER INSERT OR UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_session_updated_at();

-- Trigger to auto-complete session when all agents are completed
CREATE OR REPLACE FUNCTION check_session_completion()
RETURNS TRIGGER AS $$
DECLARE
    total_agents INTEGER;
    completed_agents INTEGER;
BEGIN
    -- Count total and completed agents for this session
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END)
    INTO total_agents, completed_agents
    FROM agents 
    WHERE session_id = NEW.session_id;
    
    -- If all agents are completed, mark session as completed
    IF total_agents > 0 AND completed_agents = total_agents THEN
        UPDATE agent_sessions 
        SET status = 'completed', completed_at = NOW() 
        WHERE id = NEW.session_id AND status != 'completed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_session_completion
    AFTER UPDATE ON agents
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION check_session_completion();

-- Comments for documentation
COMMENT ON TABLE agent_sessions IS 'Research sessions managed by the agent system';
COMMENT ON TABLE agents IS 'Individual agents within research sessions';
COMMENT ON TABLE agent_memory IS 'Memory storage for agents (session-scoped, working, and shared memory)';
COMMENT ON TABLE agent_artifacts IS 'Artifacts (reports, analyses, etc.) generated by agents';
COMMENT ON TABLE agent_tasks IS 'Tasks assigned to and managed by agents';
COMMENT ON TABLE agent_messages IS 'Inter-agent communication messages';
COMMENT ON TABLE agent_feedback IS 'User feedback on agent performance and artifacts';
COMMENT ON TABLE agent_knowledge IS 'Cross-session knowledge base for users';

COMMENT ON VIEW agent_session_summary IS 'Summary view of agent sessions with aggregated statistics';

COMMENT ON FUNCTION cleanup_expired_agent_memory() IS 'Removes expired memory entries and returns count of deleted rows';
COMMENT ON FUNCTION get_session_progress(UUID) IS 'Returns detailed progress information for a research session';
