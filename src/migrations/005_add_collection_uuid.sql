-- Migration: 005_add_collection_uuid.sql
-- Add UUID column to collections table for enhanced security

-- Add UUID column with default generation
ALTER TABLE collections ADD COLUMN uuid UUID DEFAULT gen_random_uuid();

-- Create unique index on UUID for fast lookups
CREATE UNIQUE INDEX idx_collections_uuid ON collections(uuid);

-- Ensure all existing collections have UUIDs
UPDATE collections SET uuid = gen_random_uuid() WHERE uuid IS NULL;

-- Make UUID column NOT NULL
ALTER TABLE collections ALTER COLUMN uuid SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN collections.uuid IS 'Unique identifier for collection, used for secure API access';
