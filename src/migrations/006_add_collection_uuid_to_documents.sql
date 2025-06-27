-- Migration: 006_add_collection_uuid_to_documents.sql
-- Add collection UUID reference to documents table

-- Add collection_uuid column to documents table
ALTER TABLE documents ADD COLUMN collection_uuid UUID;

-- Populate collection_uuid from existing collection_id relationships
UPDATE documents SET collection_uuid = (
    SELECT c.uuid 
    FROM collections c 
    WHERE c.id = documents.collection_id
);

-- Create index on collection_uuid for performance
CREATE INDEX idx_documents_collection_uuid ON documents(collection_uuid);

-- Add foreign key constraint to maintain referential integrity
ALTER TABLE documents ADD CONSTRAINT fk_documents_collection_uuid 
    FOREIGN KEY (collection_uuid) REFERENCES collections(uuid) ON DELETE CASCADE;

-- Add comment for documentation
COMMENT ON COLUMN documents.collection_uuid IS 'UUID reference to collection, replaces collection_id for security';
