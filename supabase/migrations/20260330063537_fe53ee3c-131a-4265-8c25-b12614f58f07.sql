
-- Allow public users to read documents with pending_signature status (for signing page)
CREATE POLICY "documents_public_read_pending_signature"
ON public.documents
FOR SELECT
TO public
USING (status IN ('pending_signature', 'signed'));

-- Allow public users to read signatures (to check if already signed)
CREATE POLICY "signatures_public_select"
ON public.signatures
FOR SELECT
TO public
USING (true);

-- Allow public users to insert signatures (for signing)
CREATE POLICY "signatures_public_insert"
ON public.signatures
FOR INSERT
TO public
WITH CHECK (true);

-- Allow public users to update document status to 'signed'
CREATE POLICY "documents_public_update_to_signed"
ON public.documents
FOR UPDATE
TO public
USING (status = 'pending_signature')
WITH CHECK (status = 'signed');
