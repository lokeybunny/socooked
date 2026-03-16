ALTER TABLE communications DISABLE TRIGGER USER;
ALTER TABLE customers DISABLE TRIGGER USER;
DELETE FROM communications WHERE customer_id IN (SELECT id FROM customers WHERE category = 'potential');
DELETE FROM customers WHERE category = 'potential';
ALTER TABLE communications ENABLE TRIGGER USER;
ALTER TABLE customers ENABLE TRIGGER USER;