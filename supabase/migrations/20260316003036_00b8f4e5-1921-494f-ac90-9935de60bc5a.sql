ALTER TABLE projects DISABLE TRIGGER USER;
ALTER TABLE tasks DISABLE TRIGGER USER;
DELETE FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE customer_id IN (SELECT id FROM customers WHERE category = 'potential'));
DELETE FROM projects WHERE customer_id IN (SELECT id FROM customers WHERE category = 'potential');
ALTER TABLE tasks ENABLE TRIGGER USER;
ALTER TABLE projects ENABLE TRIGGER USER;