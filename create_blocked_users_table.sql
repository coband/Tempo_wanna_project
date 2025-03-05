-- Erstellen der blocked_users-Tabelle, falls sie nicht existiert
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Erstellen der RLS-Richtlinien für die blocked_users-Tabelle
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Nur Superadmins dürfen lesen und schreiben
CREATE POLICY "Superadmins können blockierte Benutzer lesen" 
ON public.blocked_users
FOR SELECT
TO authenticated
USING ((auth.jwt() ->> 'user_role')::public.app_role = 'superadmin');

CREATE POLICY "Superadmins können Benutzer blockieren" 
ON public.blocked_users
FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'user_role')::public.app_role = 'superadmin'); 