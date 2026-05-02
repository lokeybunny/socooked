UPDATE public.drop_campaigns
SET audio_url = 'https://mziuxsfxevjnmdwnrqjs.supabase.co/storage/v1/object/public/content-uploads/audio/voicemail-warren.mp3',
    updated_at = now()
WHERE audio_url LIKE '%voicemail-warren%';