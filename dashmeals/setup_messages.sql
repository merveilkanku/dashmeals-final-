-- SETUP MESSAGES TABLE AND REALTIME
-- Exécutez ce script dans le SQL Editor de Supabase

-- 1. Création de la table messages si elle n'existe pas
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT NOT NULL, -- Utilisation de TEXT pour supporter les IDs mock et réels
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Activation de RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 3. Politiques RLS (très permissives pour le développement)
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
CREATE POLICY "Users can insert messages"
ON public.messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
CREATE POLICY "Users can view messages"
ON public.messages FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can update messages" ON public.messages;
CREATE POLICY "Users can update messages"
ON public.messages FOR UPDATE
USING (true);

-- 4. Activation du Realtime pour cette table
-- On s'assure que la table est dans la publication 'supabase_realtime'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'messages'
    ) THEN
        -- Si la publication n'existe pas (rare), on la crée
        IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
            CREATE PUBLICATION supabase_realtime;
        END IF;
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
END $$;

-- 5. Important pour les filtres Realtime sur des colonnes non-primaires
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 6. Index pour la performance
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON public.messages(order_id);

NOTIFY pgrst, 'reload schema';
