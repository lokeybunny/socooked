
-- ============================================================
-- Replace all USING(true) public-role policies with authenticated-only
-- ============================================================

-- Tables with simple "_all_access" or "_all" policies to replace
-- Drop old public policies and create authenticated-only ones

-- activity_log
DROP POLICY IF EXISTS "activity_log_all_access" ON public.activity_log;
CREATE POLICY "activity_log_auth_access" ON public.activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- api_previews
DROP POLICY IF EXISTS "Anyone can delete previews" ON public.api_previews;
DROP POLICY IF EXISTS "Anyone can insert previews" ON public.api_previews;
DROP POLICY IF EXISTS "Anyone can update previews" ON public.api_previews;
DROP POLICY IF EXISTS "Anyone can view previews" ON public.api_previews;
CREATE POLICY "api_previews_auth_access" ON public.api_previews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- automations
DROP POLICY IF EXISTS "automations_all_access" ON public.automations;
CREATE POLICY "automations_auth_access" ON public.automations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- availability_slots
DROP POLICY IF EXISTS "availability_slots_all_access" ON public.availability_slots;
CREATE POLICY "availability_slots_auth_access" ON public.availability_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- boards
DROP POLICY IF EXISTS "boards_all_access" ON public.boards;
CREATE POLICY "boards_auth_access" ON public.boards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- bookings: keep public INSERT/SELECT for guest booking, restrict UPDATE/DELETE to authenticated
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can manage bookings" ON public.bookings;
CREATE POLICY "bookings_public_insert" ON public.bookings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "bookings_public_select" ON public.bookings FOR SELECT TO public USING (true);
CREATE POLICY "bookings_auth_update" ON public.bookings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bookings_auth_delete" ON public.bookings FOR DELETE TO authenticated USING (true);

-- bot_tasks
DROP POLICY IF EXISTS "bot_tasks_all_access" ON public.bot_tasks;
CREATE POLICY "bot_tasks_auth_access" ON public.bot_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- calendar_events
DROP POLICY IF EXISTS "calendar_events_all_access" ON public.calendar_events;
CREATE POLICY "calendar_events_auth_access" ON public.calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- card_attachments
DROP POLICY IF EXISTS "card_attachments_all_access" ON public.card_attachments;
CREATE POLICY "card_attachments_auth_access" ON public.card_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- card_comments
DROP POLICY IF EXISTS "card_comments_all_access" ON public.card_comments;
CREATE POLICY "card_comments_auth_access" ON public.card_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- card_labels
DROP POLICY IF EXISTS "card_labels_all_access" ON public.card_labels;
CREATE POLICY "card_labels_auth_access" ON public.card_labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cards
DROP POLICY IF EXISTS "cards_all_access" ON public.cards;
CREATE POLICY "cards_auth_access" ON public.cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- checklist_items
DROP POLICY IF EXISTS "checklist_items_all_access" ON public.checklist_items;
CREATE POLICY "checklist_items_auth_access" ON public.checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- checklists
DROP POLICY IF EXISTS "checklists_all_access" ON public.checklists;
CREATE POLICY "checklists_auth_access" ON public.checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- comm_scrapes
DROP POLICY IF EXISTS "comm_scrapes_all_access" ON public.comm_scrapes;
CREATE POLICY "comm_scrapes_auth_access" ON public.comm_scrapes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- communications
DROP POLICY IF EXISTS "communications_all_access" ON public.communications;
CREATE POLICY "communications_auth_access" ON public.communications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- content_assets
DROP POLICY IF EXISTS "content_assets_all_access" ON public.content_assets;
CREATE POLICY "content_assets_auth_access" ON public.content_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- conversation_threads
DROP POLICY IF EXISTS "threads_all_access" ON public.conversation_threads;
-- Keep threads_customer_read as-is (authenticated SELECT for customer email match)
CREATE POLICY "threads_auth_access" ON public.conversation_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "customers_all_access" ON public.customers;
CREATE POLICY "customers_auth_access" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- deals
DROP POLICY IF EXISTS "deals_all_access" ON public.deals;
CREATE POLICY "deals_auth_access" ON public.deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- dev_ai_narratives
DROP POLICY IF EXISTS "dev_ai_narratives_all_access" ON public.dev_ai_narratives;
CREATE POLICY "dev_ai_narratives_auth_access" ON public.dev_ai_narratives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- discord_notify_prefs
DROP POLICY IF EXISTS "discord_notify_prefs_all_access" ON public.discord_notify_prefs;
CREATE POLICY "discord_notify_prefs_auth_access" ON public.discord_notify_prefs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- documents
DROP POLICY IF EXISTS "documents_all_access" ON public.documents;
CREATE POLICY "documents_auth_access" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- hourly_meta_summary
DROP POLICY IF EXISTS "hourly_meta_summary_all_access" ON public.hourly_meta_summary;
CREATE POLICY "hourly_meta_summary_auth_access" ON public.hourly_meta_summary FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- interactions
DROP POLICY IF EXISTS "interactions_all_access" ON public.interactions;
CREATE POLICY "interactions_auth_access" ON public.interactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- invoices
DROP POLICY IF EXISTS "invoices_all_access" ON public.invoices;
CREATE POLICY "invoices_auth_access" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- labels
DROP POLICY IF EXISTS "labels_all_access" ON public.labels;
CREATE POLICY "labels_auth_access" ON public.labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lists
DROP POLICY IF EXISTS "lists_all_access" ON public.lists;
CREATE POLICY "lists_auth_access" ON public.lists FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_buyer_config
DROP POLICY IF EXISTS "lw_buyer_config_all" ON public.lw_buyer_config;
CREATE POLICY "lw_buyer_config_auth_access" ON public.lw_buyer_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_buyer_discovery_sources
DROP POLICY IF EXISTS "lw_buyer_discovery_sources_all" ON public.lw_buyer_discovery_sources;
CREATE POLICY "lw_buyer_discovery_sources_auth_access" ON public.lw_buyer_discovery_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_buyer_ingestion_logs
DROP POLICY IF EXISTS "lw_buyer_ingestion_logs_all" ON public.lw_buyer_ingestion_logs;
CREATE POLICY "lw_buyer_ingestion_logs_auth_access" ON public.lw_buyer_ingestion_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_buyers
DROP POLICY IF EXISTS "lw_buyers_all" ON public.lw_buyers;
CREATE POLICY "lw_buyers_auth_access" ON public.lw_buyers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_call_queue
DROP POLICY IF EXISTS "lw_call_queue_all" ON public.lw_call_queue;
CREATE POLICY "lw_call_queue_auth_access" ON public.lw_call_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_deals
DROP POLICY IF EXISTS "lw_deals_all" ON public.lw_deals;
CREATE POLICY "lw_deals_auth_access" ON public.lw_deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_demand_signals
DROP POLICY IF EXISTS "lw_demand_signals_all" ON public.lw_demand_signals;
CREATE POLICY "lw_demand_signals_auth_access" ON public.lw_demand_signals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_ingestion_runs
DROP POLICY IF EXISTS "lw_ingestion_runs_all" ON public.lw_ingestion_runs;
CREATE POLICY "lw_ingestion_runs_auth_access" ON public.lw_ingestion_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- lw_sellers
DROP POLICY IF EXISTS "lw_sellers_all" ON public.lw_sellers;
CREATE POLICY "lw_sellers_auth_access" ON public.lw_sellers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- market_cap_alerts
DROP POLICY IF EXISTS "market_cap_alerts_all_access" ON public.market_cap_alerts;
CREATE POLICY "market_cap_alerts_auth_access" ON public.market_cap_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- meetings
DROP POLICY IF EXISTS "meetings_all_access" ON public.meetings;
CREATE POLICY "meetings_auth_access" ON public.meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- meta_mentions
DROP POLICY IF EXISTS "meta_mentions_all_access" ON public.meta_mentions;
CREATE POLICY "meta_mentions_auth_access" ON public.meta_mentions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- narrative_evolution
DROP POLICY IF EXISTS "narrative_evolution_all_access" ON public.narrative_evolution;
CREATE POLICY "narrative_evolution_auth_access" ON public.narrative_evolution FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- outbound_accounts
DROP POLICY IF EXISTS "outbound_accounts_all" ON public.outbound_accounts;
CREATE POLICY "outbound_accounts_auth_access" ON public.outbound_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- outbound_attempts
DROP POLICY IF EXISTS "outbound_attempts_all" ON public.outbound_attempts;
CREATE POLICY "outbound_attempts_auth_access" ON public.outbound_attempts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- payout_requests
DROP POLICY IF EXISTS "payout_requests_all_access" ON public.payout_requests;
CREATE POLICY "payout_requests_auth_access" ON public.payout_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- projects
DROP POLICY IF EXISTS "projects_all_access" ON public.projects;
CREATE POLICY "projects_auth_access" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- raiders
DROP POLICY IF EXISTS "raiders_all_access" ON public.raiders;
CREATE POLICY "raiders_auth_access" ON public.raiders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reply_engine_audit_logs
DROP POLICY IF EXISTS "reply_engine_audit_logs_all" ON public.reply_engine_audit_logs;
CREATE POLICY "reply_engine_audit_logs_auth_access" ON public.reply_engine_audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reply_engine_posts
DROP POLICY IF EXISTS "reply_engine_posts_all" ON public.reply_engine_posts;
CREATE POLICY "reply_engine_posts_auth_access" ON public.reply_engine_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reply_engine_settings
DROP POLICY IF EXISTS "reply_engine_settings_all" ON public.reply_engine_settings;
CREATE POLICY "reply_engine_settings_auth_access" ON public.reply_engine_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reply_reviews
DROP POLICY IF EXISTS "reply_reviews_all" ON public.reply_reviews;
CREATE POLICY "reply_reviews_auth_access" ON public.reply_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reply_suggestions
DROP POLICY IF EXISTS "reply_suggestions_all" ON public.reply_suggestions;
CREATE POLICY "reply_suggestions_auth_access" ON public.reply_suggestions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- research_findings
DROP POLICY IF EXISTS "research_findings_all_access" ON public.research_findings;
CREATE POLICY "research_findings_auth_access" ON public.research_findings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ringcentral_tokens - drop only the overly permissive "Service role full access", keep user-scoped ones
DROP POLICY IF EXISTS "Service role full access" ON public.ringcentral_tokens;

-- shill_clicks
DROP POLICY IF EXISTS "shill_clicks_all_access" ON public.shill_clicks;
CREATE POLICY "shill_clicks_auth_access" ON public.shill_clicks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- shill_payouts
DROP POLICY IF EXISTS "shill_payouts_all_access" ON public.shill_payouts;
CREATE POLICY "shill_payouts_auth_access" ON public.shill_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- shill_post_analytics
DROP POLICY IF EXISTS "shill_post_analytics_all_access" ON public.shill_post_analytics;
CREATE POLICY "shill_post_analytics_auth_access" ON public.shill_post_analytics FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- shill_scheduled_posts
DROP POLICY IF EXISTS "shill_scheduled_posts_all_access" ON public.shill_scheduled_posts;
CREATE POLICY "shill_scheduled_posts_auth_access" ON public.shill_scheduled_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- signature_usage
DROP POLICY IF EXISTS "signature_usage_all_access" ON public.signature_usage;
CREATE POLICY "signature_usage_auth_access" ON public.signature_usage FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- signatures
DROP POLICY IF EXISTS "signatures_all_access" ON public.signatures;
CREATE POLICY "signatures_auth_access" ON public.signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- site_configs
DROP POLICY IF EXISTS "site_configs_all_access" ON public.site_configs;
CREATE POLICY "site_configs_auth_access" ON public.site_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- smm_artist_campaigns
DROP POLICY IF EXISTS "smm_artist_campaigns_all_access" ON public.smm_artist_campaigns;
CREATE POLICY "smm_artist_campaigns_auth_access" ON public.smm_artist_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- smm_boost_orders
DROP POLICY IF EXISTS "smm_boost_orders_all_access" ON public.smm_boost_orders;
CREATE POLICY "smm_boost_orders_auth_access" ON public.smm_boost_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- smm_boost_presets
DROP POLICY IF EXISTS "smm_boost_presets_all_access" ON public.smm_boost_presets;
CREATE POLICY "smm_boost_presets_auth_access" ON public.smm_boost_presets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- smm_brand_prompts
DROP POLICY IF EXISTS "smm_brand_prompts_all_access" ON public.smm_brand_prompts;
CREATE POLICY "smm_brand_prompts_auth_access" ON public.smm_brand_prompts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- smm_content_plans
DROP POLICY IF EXISTS "smm_content_plans_all_access" ON public.smm_content_plans;
CREATE POLICY "smm_content_plans_auth_access" ON public.smm_content_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- smm_conversations
DROP POLICY IF EXISTS "smm_conversations_all_access" ON public.smm_conversations;
CREATE POLICY "smm_conversations_auth_access" ON public.smm_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tasks
DROP POLICY IF EXISTS "tasks_all_access" ON public.tasks;
CREATE POLICY "tasks_auth_access" ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- templates
DROP POLICY IF EXISTS "templates_all_access" ON public.templates;
CREATE POLICY "templates_auth_access" ON public.templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- transcriptions
DROP POLICY IF EXISTS "transcriptions_all_access" ON public.transcriptions;
CREATE POLICY "transcriptions_auth_access" ON public.transcriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- webhook_events
DROP POLICY IF EXISTS "webhook_events_all_access" ON public.webhook_events;
CREATE POLICY "webhook_events_auth_access" ON public.webhook_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- x_feed_tweets
DROP POLICY IF EXISTS "x_feed_tweets_all_access" ON public.x_feed_tweets;
CREATE POLICY "x_feed_tweets_auth_access" ON public.x_feed_tweets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage: restrict documents bucket to role-based access
DROP POLICY IF EXISTS "staff_documents_all" ON storage.objects;
CREATE POLICY "documents_auth_all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
