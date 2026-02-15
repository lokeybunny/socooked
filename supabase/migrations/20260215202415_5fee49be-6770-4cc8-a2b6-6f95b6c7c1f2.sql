
-- Fix all restrictive policies to be permissive across all tables

-- lists
DROP POLICY IF EXISTS "lists_rw" ON public.lists;
CREATE POLICY "lists_all_access" ON public.lists FOR ALL USING (true) WITH CHECK (true);

-- cards
DROP POLICY IF EXISTS "cards_rw" ON public.cards;
CREATE POLICY "cards_all_access" ON public.cards FOR ALL USING (true) WITH CHECK (true);

-- card_attachments
DROP POLICY IF EXISTS "card_attachments_rw" ON public.card_attachments;
CREATE POLICY "card_attachments_all_access" ON public.card_attachments FOR ALL USING (true) WITH CHECK (true);

-- card_comments
DROP POLICY IF EXISTS "card_comments_rw" ON public.card_comments;
CREATE POLICY "card_comments_all_access" ON public.card_comments FOR ALL USING (true) WITH CHECK (true);

-- card_labels
DROP POLICY IF EXISTS "card_labels_rw" ON public.card_labels;
CREATE POLICY "card_labels_all_access" ON public.card_labels FOR ALL USING (true) WITH CHECK (true);

-- checklist_items
DROP POLICY IF EXISTS "checklist_items_rw" ON public.checklist_items;
CREATE POLICY "checklist_items_all_access" ON public.checklist_items FOR ALL USING (true) WITH CHECK (true);

-- checklists
DROP POLICY IF EXISTS "checklists_rw" ON public.checklists;
CREATE POLICY "checklists_all_access" ON public.checklists FOR ALL USING (true) WITH CHECK (true);

-- labels
DROP POLICY IF EXISTS "labels_rw" ON public.labels;
CREATE POLICY "labels_all_access" ON public.labels FOR ALL USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "customers_rw" ON public.customers;
CREATE POLICY "customers_all_access" ON public.customers FOR ALL USING (true) WITH CHECK (true);

-- deals
DROP POLICY IF EXISTS "deals_rw" ON public.deals;
CREATE POLICY "deals_all_access" ON public.deals FOR ALL USING (true) WITH CHECK (true);

-- projects
DROP POLICY IF EXISTS "projects_rw" ON public.projects;
CREATE POLICY "projects_all_access" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- tasks
DROP POLICY IF EXISTS "tasks_rw" ON public.tasks;
CREATE POLICY "tasks_all_access" ON public.tasks FOR ALL USING (true) WITH CHECK (true);

-- content_assets
DROP POLICY IF EXISTS "content_assets_rw" ON public.content_assets;
CREATE POLICY "content_assets_all_access" ON public.content_assets FOR ALL USING (true) WITH CHECK (true);

-- automations
DROP POLICY IF EXISTS "automations_rw" ON public.automations;
CREATE POLICY "automations_all_access" ON public.automations FOR ALL USING (true) WITH CHECK (true);

-- activity_log
DROP POLICY IF EXISTS "activity_log_rw" ON public.activity_log;
CREATE POLICY "activity_log_all_access" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

-- conversation_threads
DROP POLICY IF EXISTS "threads_rw" ON public.conversation_threads;
CREATE POLICY "threads_all_access" ON public.conversation_threads FOR ALL USING (true) WITH CHECK (true);

-- documents
DROP POLICY IF EXISTS "documents_rw" ON public.documents;
CREATE POLICY "documents_all_access" ON public.documents FOR ALL USING (true) WITH CHECK (true);

-- invoices
DROP POLICY IF EXISTS "invoices_rw" ON public.invoices;
CREATE POLICY "invoices_all_access" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- interactions
DROP POLICY IF EXISTS "interactions_rw" ON public.interactions;
CREATE POLICY "interactions_all_access" ON public.interactions FOR ALL USING (true) WITH CHECK (true);

-- signatures
DROP POLICY IF EXISTS "signatures_rw" ON public.signatures;
CREATE POLICY "signatures_all_access" ON public.signatures FOR ALL USING (true) WITH CHECK (true);

-- webhook_events
DROP POLICY IF EXISTS "webhook_events_rw" ON public.webhook_events;
CREATE POLICY "webhook_events_all_access" ON public.webhook_events FOR ALL USING (true) WITH CHECK (true);
