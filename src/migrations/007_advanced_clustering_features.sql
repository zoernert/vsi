-- Migration: Add advanced clustering features tables
-- Created: 2025-06-28
-- Description: Add tables for cluster suggestions, analytics, and events

-- Cluster suggestions and recommendations
CREATE TABLE IF NOT EXISTS cluster_suggestions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    suggested_cluster_id INTEGER REFERENCES clusters(id) ON DELETE SET NULL,
    suggestion_type VARCHAR(50) NOT NULL CHECK (suggestion_type IN ('move_to_existing', 'create_new', 'merge', 'split')),
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    reasoning TEXT,
    suggested_name VARCHAR(200), -- For create_new suggestions
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

-- Indexes for cluster_suggestions
CREATE INDEX IF NOT EXISTS idx_cluster_suggestions_user_id ON cluster_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_cluster_suggestions_collection_id ON cluster_suggestions(collection_id);
CREATE INDEX IF NOT EXISTS idx_cluster_suggestions_status ON cluster_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_cluster_suggestions_created_at ON cluster_suggestions(created_at);

-- Cross-cluster analytics results
CREATE TABLE IF NOT EXISTS cluster_analytics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL CHECK (analysis_type IN ('overlap', 'bridge_docs', 'similarity', 'duplication', 'collaboration')),
    source_cluster_id INTEGER REFERENCES clusters(id) ON DELETE CASCADE,
    target_cluster_id INTEGER REFERENCES clusters(id) ON DELETE CASCADE,
    similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),
    bridge_documents TEXT[], -- Array of document IDs that act as bridges
    overlap_collections TEXT[], -- Array of collection IDs with overlapping content
    metadata JSONB DEFAULT '{}',
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days') -- Analytics data expires after 7 days
);

-- Indexes for cluster_analytics
CREATE INDEX IF NOT EXISTS idx_cluster_analytics_user_id ON cluster_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_cluster_analytics_type ON cluster_analytics(analysis_type);
CREATE INDEX IF NOT EXISTS idx_cluster_analytics_source_cluster ON cluster_analytics(source_cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_analytics_analyzed_at ON cluster_analytics(analyzed_at);

-- Dynamic clustering events log
CREATE TABLE IF NOT EXISTS cluster_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('split', 'merge', 'rebalance', 'auto_suggestion', 'manual_move', 'health_check')),
    source_cluster_ids INTEGER[] NOT NULL DEFAULT '{}', -- Array of source cluster IDs
    target_cluster_ids INTEGER[] NOT NULL DEFAULT '{}', -- Array of target cluster IDs  
    affected_collections INTEGER[] NOT NULL DEFAULT '{}', -- Array of affected collection IDs
    trigger_reason TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}', -- Store additional event details
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for cluster_events
CREATE INDEX IF NOT EXISTS idx_cluster_events_user_id ON cluster_events(user_id);
CREATE INDEX IF NOT EXISTS idx_cluster_events_type ON cluster_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cluster_events_created_at ON cluster_events(created_at);
CREATE INDEX IF NOT EXISTS idx_cluster_events_success ON cluster_events(success);

-- Enhanced cluster metrics (add columns to existing clusters table)
DO $$ 
BEGIN
    -- Add health_metrics column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clusters' AND column_name = 'health_metrics') THEN
        ALTER TABLE clusters ADD COLUMN health_metrics JSONB DEFAULT '{}';
    END IF;
    
    -- Add last_analysis_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clusters' AND column_name = 'last_analysis_at') THEN
        ALTER TABLE clusters ADD COLUMN last_analysis_at TIMESTAMP;
    END IF;
    
    -- Add auto_management_enabled column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'clusters' AND column_name = 'auto_management_enabled') THEN
        ALTER TABLE clusters ADD COLUMN auto_management_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Create indexes for new cluster columns
CREATE INDEX IF NOT EXISTS idx_clusters_last_analysis_at ON clusters(last_analysis_at);
CREATE INDEX IF NOT EXISTS idx_clusters_auto_management ON clusters(auto_management_enabled);

-- Cluster collaboration opportunities view
CREATE OR REPLACE VIEW cluster_collaboration_opportunities AS
SELECT 
    ca.user_id,
    ca.source_cluster_id,
    ca.target_cluster_id,
    c1.name as source_cluster_name,
    c2.name as target_cluster_name,
    ca.similarity_score,
    ca.analysis_type,
    ARRAY_LENGTH(ca.bridge_documents, 1) as bridge_count,
    ca.analyzed_at
FROM cluster_analytics ca
JOIN clusters c1 ON ca.source_cluster_id = c1.id
JOIN clusters c2 ON ca.target_cluster_id = c2.id
WHERE ca.analysis_type IN ('bridge_docs', 'similarity', 'collaboration')
  AND ca.similarity_score >= 0.6
  AND ca.analyzed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY ca.similarity_score DESC;

-- Cluster health summary view
CREATE OR REPLACE VIEW cluster_health_summary AS
SELECT 
    c.user_id,
    c.id as cluster_id,
    c.name as cluster_name,
    COUNT(DISTINCT col.id) as collection_count,
    COUNT(DISTINCT d.id) as document_count,
    MAX(d.created_at) as last_document_added,
    COUNT(CASE WHEN d.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 END) as recent_documents,
    c.health_metrics,
    c.last_analysis_at,
    c.auto_management_enabled,
    CASE 
        WHEN COUNT(DISTINCT col.id) = 0 THEN 'empty'
        WHEN COUNT(DISTINCT col.id) = 1 THEN 'undersized'
        WHEN COUNT(DISTINCT col.id) BETWEEN 2 AND 8 THEN 'optimal'
        WHEN COUNT(DISTINCT col.id) BETWEEN 9 AND 12 THEN 'large'
        ELSE 'oversized'
    END as size_category,
    CASE 
        WHEN COUNT(CASE WHEN d.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 END) > 5 THEN 'very_active'
        WHEN COUNT(CASE WHEN d.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 END) > 2 THEN 'active'
        WHEN COUNT(CASE WHEN d.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 END) > 0 THEN 'moderate'
        WHEN COUNT(DISTINCT d.id) > 0 THEN 'inactive'
        ELSE 'empty'
    END as activity_level
FROM clusters c
LEFT JOIN collections col ON c.id = col.cluster_id
LEFT JOIN documents d ON col.id = d.collection_id
GROUP BY c.id, c.user_id, c.name, c.health_metrics, c.last_analysis_at, c.auto_management_enabled;

-- Function to clean up expired suggestions and analytics
CREATE OR REPLACE FUNCTION cleanup_expired_cluster_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up expired suggestions
    DELETE FROM cluster_suggestions WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up expired analytics
    DELETE FROM cluster_analytics WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    -- Clean up old events (keep only last 90 days)
    DELETE FROM cluster_events WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update cluster last_analysis_at when health_metrics is updated
CREATE OR REPLACE FUNCTION update_cluster_analysis_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.health_metrics IS DISTINCT FROM NEW.health_metrics THEN
        NEW.last_analysis_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cluster_analysis_timestamp ON clusters;
CREATE TRIGGER trigger_update_cluster_analysis_timestamp
    BEFORE UPDATE ON clusters
    FOR EACH ROW
    EXECUTE FUNCTION update_cluster_analysis_timestamp();

-- Insert some initial data for testing (optional)
-- This can be commented out in production

-- Add comments to tables for documentation
COMMENT ON TABLE cluster_suggestions IS 'AI-generated suggestions for cluster organization and improvements';
COMMENT ON TABLE cluster_analytics IS 'Cross-cluster analysis results including overlaps, bridges, and similarities';
COMMENT ON TABLE cluster_events IS 'Log of all cluster management operations (splits, merges, rebalancing)';
COMMENT ON VIEW cluster_collaboration_opportunities IS 'Active collaboration opportunities between clusters based on content similarity';
COMMENT ON VIEW cluster_health_summary IS 'Comprehensive health metrics for all clusters including size and activity analysis';

-- Grant permissions (adjust as needed for your application)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON cluster_suggestions TO vsi_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON cluster_analytics TO vsi_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON cluster_events TO vsi_user;
-- GRANT SELECT ON cluster_collaboration_opportunities TO vsi_user;
-- GRANT SELECT ON cluster_health_summary TO vsi_user;
