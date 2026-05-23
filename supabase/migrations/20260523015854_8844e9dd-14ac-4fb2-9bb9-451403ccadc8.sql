-- Allow anonymous (public) read of proposal documents pending signature so the
-- signing page (/sign/agreement/:documentId) can load for clients receiving the link.
CREATE POLICY "Public can view proposal docs pending signature"
ON public.documents
FOR SELECT
TO anon, authenticated
USING (type = 'proposal' AND status IN ('pending_signature', 'signed'));

-- Allow anonymous read of existing signatures for that same document (so the
-- "already signed" check on the signing page works without auth).
CREATE POLICY "Public can view signatures for proposal docs"
ON public.signatures
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = signatures.document_id
      AND d.type = 'proposal'
      AND d.status IN ('pending_signature', 'signed')
  )
);