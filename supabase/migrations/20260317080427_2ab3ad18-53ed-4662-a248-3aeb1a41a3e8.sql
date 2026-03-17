
UPDATE smm_content_plans 
SET schedule_items = (
  SELECT jsonb_agg(
    CASE 
      WHEN item->>'caption' NOT LIKE '%@oranjgoodman%' 
      THEN jsonb_set(item, '{caption}', to_jsonb((item->>'caption') || ' @oranjgoodman'))
      ELSE item
    END
  )
  FROM jsonb_array_elements(schedule_items) AS item
),
updated_at = now()
WHERE id = 'dbb09e5d-8d7b-47da-bb50-0fed94ada70d';
