-- Migration: Make qdrant_collection_name nullable to support UUID-based naming
-- This allows the two-step collection creation process where we:
-- 1. Insert collection to get UUID
-- 2. Update with UUID-based qdrant_collection_name

-- Make qdrant_collection_name nullable
ALTER TABLE collections ALTER COLUMN qdrant_collection_name DROP NOT NULL;

-- Add a comment explaining the change
COMMENT ON COLUMN collections.qdrant_collection_name IS 'Qdrant collection name based on UUID. Nullable during creation, populated after UUID generation.';
