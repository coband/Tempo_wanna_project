// Importiere die Clerk API
import { useUser } from "@clerk/clerk-react";

// Typdeklarationen
export type UserRole = 'admin' | 'superadmin';

export interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  is_blocked: boolean;
  block_reason: string | null;
}

// Hinweis: Die API-Funktionen wurden in die UserManagement-Komponente verschoben,
// da sie dort den authentifizierten Supabase-Client verwenden können. 