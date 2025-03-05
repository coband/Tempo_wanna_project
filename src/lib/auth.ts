import { createContext, useContext } from "react";
import type { User, Session } from "@supabase/supabase-js";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User }>;
  signUp: (email: string, password: string) => Promise<{ user: User | null; session: Session | null; } | { user: null; session: null; }>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType,
);

export function useAuth() {
  return useContext(AuthContext);
}
