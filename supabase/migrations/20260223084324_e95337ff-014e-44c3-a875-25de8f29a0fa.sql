
-- Drop and recreate http extension in the extensions schema
DROP EXTENSION IF EXISTS http;
CREATE EXTENSION http WITH SCHEMA extensions;
