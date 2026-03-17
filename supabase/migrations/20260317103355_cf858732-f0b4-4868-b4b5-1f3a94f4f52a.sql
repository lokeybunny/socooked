-- Fix @lamb.wavv! → @lamb.wavv (remove exclamation after handle) in titles
UPDATE calendar_events 
SET title = REPLACE(title, '@lamb.wavv!', '@lamb.wavv'),
    updated_at = now()
WHERE source = 'smm' AND title LIKE '%@lamb.wavv!%';

-- Fix @lamb.wavv! → @lamb.wavv in descriptions
UPDATE calendar_events 
SET description = REPLACE(description, '@lamb.wavv!', '@lamb.wavv'),
    updated_at = now()
WHERE source = 'smm' AND description LIKE '%@lamb.wavv!%';