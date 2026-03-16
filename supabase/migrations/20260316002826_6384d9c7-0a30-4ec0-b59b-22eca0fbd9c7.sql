ALTER TABLE deals DISABLE TRIGGER USER;
DELETE FROM deals WHERE customer_id IN (SELECT id FROM customers WHERE category = 'potential');
ALTER TABLE deals ENABLE TRIGGER USER;