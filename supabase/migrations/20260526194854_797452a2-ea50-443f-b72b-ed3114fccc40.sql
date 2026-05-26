
-- 1) Landing pages: create a public-safe view and restrict the underlying table
CREATE OR REPLACE VIEW public.lw_landing_pages_public
WITH (security_invoker = true) AS
SELECT
  id, slug, client_name, tagline, headline, sub_headline,
  photo_url, logo_url, accent_color, phone, email,
  reviews, meta, is_active, created_at, updated_at
FROM public.lw_landing_pages
WHERE is_active = true;

GRANT SELECT ON public.lw_landing_pages_public TO anon, authenticated;

-- Drop the broad public read of the underlying table so client_password
-- cannot be exposed even if column-level privileges are reset later.
DROP POLICY IF EXISTS lw_landing_pages_public_read ON public.lw_landing_pages;

-- 2) Signatures: stop leaking signer PII (email, ip, signature image) to anon.
-- Replace the public SELECT with an RPC-only existence/listing check.
DROP POLICY IF EXISTS "Public can view signatures for proposal docs" ON public.signatures;

CREATE OR REPLACE FUNCTION public.document_signature_exists(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.signatures s
    JOIN public.documents d ON d.id = s.document_id
    WHERE s.document_id = _document_id
      AND d.type = 'proposal'
      AND d.status = ANY (ARRAY['pending_signature','signed'])
  );
$$;

REVOKE ALL ON FUNCTION public.document_signature_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_signature_exists(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.customer_signature_exists(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.signatures WHERE customer_id = _customer_id
  );
$$;

REVOKE ALL ON FUNCTION public.customer_signature_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_signature_exists(uuid) TO anon, authenticated;
