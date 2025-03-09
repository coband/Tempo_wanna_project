// Importiere die Clerk API
import { useUser, useAuth } from "@clerk/clerk-react";

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

// URL für die Supabase Edge Function
const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/clerk-users";

/**
 * Benutzer mit Rollen auflisten
 */
export const listUsers = async (): Promise<User[]> => {
  try {
    // Rufe die Supabase Edge Function auf (die als Proxy für Clerk dient)
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'list-users' })
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Abrufen der Benutzer: ${response.statusText}`);
    }

    const { users } = await response.json();
    return users;
  } catch (error) {
    console.error("Fehler beim Abrufen der Benutzer:", error);
    throw error;
  }
};

/**
 * Benutzerrolle umschalten
 */
export const toggleUserRole = async (userId: string, role: UserRole): Promise<{ hasRole: boolean }> => {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'toggle-role',
        userId,
        role
      })
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Ändern der Rolle: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Fehler beim Umschalten der ${role}-Rolle:`, error);
    throw error;
  }
};

/**
 * Benutzer sperren/entsperren
 */
export const toggleUserBlock = async (userId: string, reason?: string): Promise<{ isBlocked: boolean }> => {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'toggle-block',
        userId,
        reason
      })
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Sperren/Entsperren: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Fehler beim Sperren/Entsperren des Benutzers:", error);
    throw error;
  }
};

/**
 * Passwort zurücksetzen
 */
export const resetUserPassword = async (email: string): Promise<{ message: string }> => {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'reset-password',
        email
      })
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Senden des Links: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Fehler beim Zurücksetzen des Passworts:", error);
    throw error;
  }
};

/**
 * Prüfen, ob der aktuelle Benutzer ein Superadmin ist
 */
export const checkIsSuperAdmin = (): boolean => {
  // Hook muss in einem Funktionskomponente-Kontext verwendet werden
  // Diese Funktion wird nun direkt in der Komponente verwendet
  return false;
}; 