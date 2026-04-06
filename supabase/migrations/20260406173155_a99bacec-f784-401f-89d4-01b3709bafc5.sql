ALTER TABLE public.customers DROP CONSTRAINT customers_status_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_status_check CHECK (status = ANY (ARRAY['lead','prospect','prospect_emailed','active','inactive','churned','monthly','won','new','customer','ai_complete','agreement_sent','scheduled','closed','dead','contacted']));
