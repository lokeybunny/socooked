CREATE UNIQUE INDEX IF NOT EXISTS idx_communications_voidfix_inbound_external_once
ON public.communications (provider, direction, external_id)
WHERE provider = 'voidfix'
  AND direction = 'inbound'
  AND external_id IS NOT NULL
  AND external_id <> '';