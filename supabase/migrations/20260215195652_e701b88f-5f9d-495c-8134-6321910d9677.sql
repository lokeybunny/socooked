-- Add address column to customers table for bot-ingested lead data
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address text;