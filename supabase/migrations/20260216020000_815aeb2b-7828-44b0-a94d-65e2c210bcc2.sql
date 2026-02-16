
-- Add category column to all relevant tables
ALTER TABLE public.boards ADD COLUMN category text;
ALTER TABLE public.customers ADD COLUMN category text;
ALTER TABLE public.deals ADD COLUMN category text;
ALTER TABLE public.conversation_threads ADD COLUMN category text;
ALTER TABLE public.projects ADD COLUMN category text;
ALTER TABLE public.tasks ADD COLUMN category text;
ALTER TABLE public.content_assets ADD COLUMN category text;
ALTER TABLE public.documents ADD COLUMN category text;
ALTER TABLE public.signatures ADD COLUMN category text;

-- Create index for faster category filtering
CREATE INDEX idx_boards_category ON public.boards(category);
CREATE INDEX idx_customers_category ON public.customers(category);
CREATE INDEX idx_deals_category ON public.deals(category);
CREATE INDEX idx_conversation_threads_category ON public.conversation_threads(category);
CREATE INDEX idx_projects_category ON public.projects(category);
CREATE INDEX idx_tasks_category ON public.tasks(category);
CREATE INDEX idx_content_assets_category ON public.content_assets(category);
CREATE INDEX idx_documents_category ON public.documents(category);
CREATE INDEX idx_signatures_category ON public.signatures(category);
