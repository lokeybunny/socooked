ALTER TABLE customers DROP CONSTRAINT customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check CHECK (status = ANY (ARRAY['lead', 'prospect', 'prospect_emailed', 'active', 'inactive', 'churned', 'monthly', 'won']));
UPDATE customers SET status = 'prospect_emailed' WHERE id = '09186000-a93c-4837-991f-c26d2d7a9905';