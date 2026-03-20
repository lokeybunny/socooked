UPDATE calendar_events
SET description = regexp_replace(
  description,
  'Media URL:\s*https://[^\n]*OJ_\d+\.mp4',
  'Media URL: https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/ai-generated/NysonBlack/cortex-strategist/1773728449625_OvERKill_01.mp4'
)
WHERE id IN (
  '9346e86f-87b3-418b-b3ef-c88a0f790623',
  '7390b587-9f24-48e0-8fce-47d8dcb213dc',
  'bf81779d-01ee-43c4-aeb8-0f39126a99fd',
  'f8456d04-36b7-4dc2-a96d-eec743f76aa6',
  'ff8faeb4-a0e1-416f-af31-6ca53412abd6',
  'aa1c1c9e-4f0d-44d2-b39d-2d684eefea5b',
  '2f3be677-ed9a-4200-bada-6d72c3ee5725'
);

UPDATE calendar_events
SET description = regexp_replace(
  description,
  'media_url:https://[^\]]*OJ_\d+\.mp4',
  'media_url:https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/ai-generated/NysonBlack/cortex-strategist/1773728449625_OvERKill_01.mp4'
)
WHERE id IN (
  '9346e86f-87b3-418b-b3ef-c88a0f790623',
  '7390b587-9f24-48e0-8fce-47d8dcb213dc',
  'bf81779d-01ee-43c4-aeb8-0f39126a99fd',
  'f8456d04-36b7-4dc2-a96d-eec743f76aa6',
  'ff8faeb4-a0e1-416f-af31-6ca53412abd6',
  'aa1c1c9e-4f0d-44d2-b39d-2d684eefea5b',
  '2f3be677-ed9a-4200-bada-6d72c3ee5725'
)