
-- Fix: drop restrictive customers status check and replace with broader one
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_status_check 
  CHECK (status = ANY (ARRAY[
    'lead', 'prospect', 'prospect_emailed', 'active', 'inactive', 'churned', 'monthly', 'won',
    'new', 'customer', 'ai_complete', 'agreement_sent', 'scheduled', 'closed', 'dead'
  ]));

-- Add archived_at column to api_previews for 72h archive-to-delete workflow
ALTER TABLE public.api_previews ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;
