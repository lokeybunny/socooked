-- Recover stuck PowerDial calls where AMD said human/voicemail but the
-- webhook never managed to flip twilio_status to a terminal state (usually
-- because the lead hung up before the redirect fired). Without this, the
-- "active call" guard blocks all new dialing.
UPDATE public.powerdial_call_logs
SET twilio_status = 'completed', connected_to_vapi = false
WHERE twilio_status = 'initiated'
  AND amd_result IN ('human', 'voicemail', 'failed', 'busy', 'no_answer')
  AND created_at < now() - interval '90 seconds';

-- Free any queue items that are still marked "dialing" for a stale call log
UPDATE public.powerdial_queue q
SET status = 'completed',
    last_result = COALESCE(last_result, 'recovered_stuck_call')
WHERE q.status = 'dialing'
  AND q.updated_at < now() - interval '5 minutes';