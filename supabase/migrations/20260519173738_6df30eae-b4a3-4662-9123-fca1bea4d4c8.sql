
-- 1) bookings: drop public SELECT, keep public INSERT for guest booking flow
DROP POLICY IF EXISTS "bookings_public_select" ON public.bookings;

-- 2) analytics_sessions: remove public UPDATE
DROP POLICY IF EXISTS "anyone can update sessions" ON public.analytics_sessions;

-- 3) apify_config: restrict to admins only
DROP POLICY IF EXISTS "Authenticated users can read apify_config" ON public.apify_config;
DROP POLICY IF EXISTS "Authenticated users can insert apify_config" ON public.apify_config;
DROP POLICY IF EXISTS "Authenticated users can update apify_config" ON public.apify_config;
DROP POLICY IF EXISTS "Authenticated users can delete apify_config" ON public.apify_config;
CREATE POLICY "apify_config_admin_all" ON public.apify_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) guru_subscriptions: admin-only SELECT/UPDATE/DELETE; keep public insert
DROP POLICY IF EXISTS "guru_subscriptions_auth_access" ON public.guru_subscriptions;
CREATE POLICY "guru_subscriptions_admin_select" ON public.guru_subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "guru_subscriptions_admin_update" ON public.guru_subscriptions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "guru_subscriptions_admin_delete" ON public.guru_subscriptions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5) payme_charges: remove public SELECT
DROP POLICY IF EXISTS "Anyone can view payme receipts" ON public.payme_charges;
CREATE POLICY "payme_charges_auth_select" ON public.payme_charges
  FOR SELECT TO authenticated USING (true);

-- 6) signatures: admin-only SELECT/UPDATE/DELETE; keep public insert
DROP POLICY IF EXISTS "signatures_auth_access" ON public.signatures;
CREATE POLICY "signatures_admin_select" ON public.signatures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "signatures_admin_update" ON public.signatures
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "signatures_admin_delete" ON public.signatures
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7) lw_landing_pages: remove client_password from anon-readable columns via column privilege
REVOKE SELECT (client_password) ON public.lw_landing_pages FROM anon;
REVOKE SELECT (client_password) ON public.lw_landing_pages FROM PUBLIC;

-- 8) documents: drop public SELECT and public UPDATE
DROP POLICY IF EXISTS "documents_public_read_pending_signature" ON public.documents;
DROP POLICY IF EXISTS "documents_public_update_to_signed" ON public.documents;

-- 9) proposals: drop public SELECT via document
DROP POLICY IF EXISTS "proposals_public_read_via_doc" ON public.proposals;

-- 10) content-uploads storage bucket: require authentication for INSERT/DELETE
DROP POLICY IF EXISTS "Authenticated upload content-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete content-uploads" ON storage.objects;
CREATE POLICY "content_uploads_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-uploads');
CREATE POLICY "content_uploads_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'content-uploads');

-- 11) realtime.messages: require authentication to subscribe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='realtime' AND tablename='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='realtime_authenticated_only'
    ) THEN
      EXECUTE $p$CREATE POLICY "realtime_authenticated_only" ON realtime.messages
        FOR SELECT TO authenticated USING (true)$p$;
    END IF;
  END IF;
END $$;
