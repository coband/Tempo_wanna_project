/**
 * Zentrale Supabase Konfiguration
 * 
 * Diese Datei exportiert den öffentlichen Supabase-Client aus dem SupabaseContext
 * für globale Verwendung, wenn keine Authentifizierung benötigt wird.
 */

import { publicClient as supabase } from '@/contexts/SupabaseContext';

export { supabase }; 