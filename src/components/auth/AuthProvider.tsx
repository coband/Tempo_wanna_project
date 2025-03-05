import { useState, useEffect } from "react";
import { AuthContext } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { jwtDecode } from "jwt-decode";

// JWT-Typ mit benutzerdefinierten Claims definieren
interface JwtPayload {
  user_role?: string;
  [key: string]: any;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Benutzerrolle aus JWT extrahieren
  const getUserRoleFromJWT = (accessToken) => {
    if (!accessToken) return { isAdmin: false, isSuperAdmin: false };
    try {
      const jwt = jwtDecode<JwtPayload>(accessToken);
      const userRole = jwt.user_role;
      return {
        isAdmin: userRole === 'admin' || userRole === 'superadmin',
        isSuperAdmin: userRole === 'superadmin'
      };
    } catch (error) {
      console.error("Fehler beim Dekodieren des JWT:", error);
      return { isAdmin: false, isSuperAdmin: false };
    }
  };

  useEffect(() => {
    // Aktive Sitzungen prüfen und Benutzer festlegen
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      const { isAdmin, isSuperAdmin } = getUserRoleFromJWT(session?.access_token);
      setIsAdmin(isAdmin);
      setIsSuperAdmin(isSuperAdmin);
      setLoading(false);
    });

    // Auf Änderungen am Auth-Status hören (angemeldet, abgemeldet usw.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      const { isAdmin, isSuperAdmin } = getUserRoleFromJWT(session?.access_token);
      setIsAdmin(isAdmin);
      setIsSuperAdmin(isSuperAdmin);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    setUser(data.user);
    const { isAdmin, isSuperAdmin } = getUserRoleFromJWT(data.session?.access_token);
    setIsAdmin(isAdmin);
    setIsSuperAdmin(isSuperAdmin);
    return { user: data.user };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Keine user_role Metadaten mehr, da wir jetzt user_roles Tabelle verwenden
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Warten, bis die Sitzung gelöscht ist
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setUser(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } else {
        throw new Error("Sitzung immer noch aktiv");
      }
    } catch (error) {
      console.error("SignOut-Fehler:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isAdmin, isSuperAdmin, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
