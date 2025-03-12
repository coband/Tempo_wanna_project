import { createContext, useContext } from "react";
import { 
  useAuth as useClerkAuth, 
  useUser, 
  SignIn, 
  SignUp, 
  SignedIn, 
  SignedOut, 
  UserButton 
} from "@clerk/clerk-react";

// Re-exportieren von Clerk-Komponenten für einfacheren Zugriff
export {
  SignIn,
  SignUp,
  SignedIn,
  SignedOut,
  UserButton
};

type AuthContextType = {
  user: any | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ user: any }>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
};

// Erstelle einen leeren Kontext für die Abwärtskompatibilität
export const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType,
);

/**
 * Hook für den Zugriff auf Clerk-Authentifizierungsdaten
 * Vereinfacht den Zugriff auf Benutzerinformationen und Rollen
 */
export function useAuth() {
  const { isLoaded, userId, sessionId } = useClerkAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  
  // Benutzerrollen aus den Clerk Public Metadata extrahieren
  const isAdmin = user?.publicMetadata?.role === 'admin' || user?.publicMetadata?.role === 'superadmin';
  const isSuperAdmin = user?.publicMetadata?.role === 'superadmin';
  
  return {
    user,
    loading: !isLoaded || !isUserLoaded,
    isAdmin,
    isSuperAdmin,
    userId,
    isAuthenticated: !!userId
  };
}
