-- Step 1: Delete duplicate Drake SMM calendar events, keeping only the oldest per source_id
DELETE FROM calendar_events
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at ASC) as rn
    FROM calendar_events
    WHERE source = 'smm' AND title ILIKE '%drake%'
  ) sub
  WHERE rn > 1
);

-- Step 2: Shift all remaining Drake SMM events back 8 days (March 25 -> March 17)
UPDATE calendar_events
SET start_time = start_time - INTERVAL '8 days',
    end_time = end_time - INTERVAL '8 days'
WHERE source = 'smm' AND title ILIKE '%drake%';