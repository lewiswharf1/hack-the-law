-- Migration: Add file_type column to documents table
-- This migration adds support for multiple file format uploads (DOCX, EML, CSV, etc.)

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'pdf';

-- Backfill existing records with 'pdf' as the default file type
UPDATE documents SET file_type = 'pdf' WHERE file_type IS NULL OR file_type = '';
