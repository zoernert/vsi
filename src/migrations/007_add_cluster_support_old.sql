-- Add cluster table
CREATE TABLE IF NOT EXISTS clusters (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    cluster_type VARCHAR(50) DEFAULT 'logical',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Add cluster reference to collections (conditionally)
ALTER TABLE collections ADD COLUMN IF NOT EXISTS cluster_id INTEGER;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS cluster_name VARCHAR(255);
ALTER TABLE collections ADD COLUMN IF NOT EXISTS shard_config JSONB DEFAULT '{}';

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'collections_cluster_id_fkey' 
        AND table_name = 'collections'
    ) THEN
        ALTER TABLE collections ADD CONSTRAINT collections_cluster_id_fkey 
        FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes (conditionally)
CREATE INDEX IF NOT EXISTS idx_clusters_user_id ON clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_clusters_uuid ON clusters(uuid);
CREATE INDEX IF NOT EXISTS idx_collections_cluster_id ON collections(cluster_id);
CREATE INDEX IF NOT EXISTS idx_collections_cluster_name ON collections(cluster_name);

-- Add cluster settings table for advanced configurations
CREATE TABLE IF NOT EXISTS cluster_settings (
    id SERIAL PRIMARY KEY,
    cluster_id INTEGER REFERENCES clusters(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cluster_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_cluster_settings_cluster_id ON cluster_settings(cluster_id);