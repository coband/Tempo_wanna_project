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

/**
 * Zentrale Hook für den Zugriff auf Clerk-Authentifizierungsdaten
 * Vereinfacht den Zugriff auf Benutzerinformationen und Rollen
 */
export function useAuth() {
  const { isLoaded, userId, sessionId, getToken } = useClerkAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  
  // Benutzerrollen aus den Clerk Public Metadata extrahieren
  const userRole = user?.publicMetadata?.role as string || null;
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isSuperAdmin = userRole === 'superadmin';
  
  return {
    user,
    loading: !isLoaded || !isUserLoaded,
    isAdmin,
    isSuperAdmin,
    userId,
    userRole,
    isAuthenticated: !!userId,
    getToken  // Hinzufügen der getToken-Funktion für direkten Zugriff
  };
}
