
-- 1. Fix @lamb.wavvv → @lamb.wavv in titles
UPDATE calendar_events 
SET title = REPLACE(title, '@lamb.wavvv', '@lamb.wavv'),
    updated_at = now()
WHERE source = 'smm' AND title ILIKE '%@lamb.wavvv%';

-- 2. Fix @lamb.wavvv → @lamb.wavv in descriptions
UPDATE calendar_events 
SET description = REPLACE(description, '@lamb.wavvv', '@lamb.wavv'),
    updated_at = now()
WHERE source = 'smm' AND description ILIKE '%@lamb.wavvv%';

-- 3. Add @oranjgoodman tag to all Oranj calendar events that don't have it
UPDATE calendar_events
SET description = description || E'\n\n🎤 @oranjgoodman',
    updated_at = now()
WHERE source = 'smm' 
  AND (title ILIKE '%oranj%' OR description ILIKE '%oranj%')
  AND description NOT ILIKE '%@oranjgoodman%';
