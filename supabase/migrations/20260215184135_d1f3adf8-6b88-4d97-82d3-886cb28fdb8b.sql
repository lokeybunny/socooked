
-- Boards
CREATE TABLE public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','team')),
  owner_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boards_rw" ON public.boards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lists
CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lists_rw" ON public.lists FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Cards
CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  source text,
  source_url text,
  external_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','archived')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_date date,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  assigned_to uuid REFERENCES public.profiles(id),
  customer_id uuid REFERENCES public.customers(id),
  deal_id uuid REFERENCES public.deals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards_rw" ON public.cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_cards_external_id ON public.cards(external_id);
CREATE INDEX idx_cards_list_id ON public.cards(list_id);
CREATE INDEX idx_cards_board_id ON public.cards(board_id);

-- Labels
CREATE TABLE public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "labels_rw" ON public.labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Card-Labels join
CREATE TABLE public.card_labels (
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);
ALTER TABLE public.card_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card_labels_rw" ON public.card_labels FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Checklists
CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Checklist',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklists_rw" ON public.checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Checklist Items
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_items_rw" ON public.checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Card Comments
CREATE TABLE public.card_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.card_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card_comments_rw" ON public.card_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Card Attachments
CREATE TABLE public.card_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('url','file','image')),
  title text,
  url text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.card_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card_attachments_rw" ON public.card_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime on cards for drag-drop sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
