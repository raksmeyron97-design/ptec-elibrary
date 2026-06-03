-- Add max_progress_pct to reading_progress
ALTER TABLE reading_progress ADD COLUMN max_progress_pct numeric(5,2) DEFAULT 0;

-- Backfill existing rows
UPDATE reading_progress SET max_progress_pct = progress_pct WHERE max_progress_pct = 0;
