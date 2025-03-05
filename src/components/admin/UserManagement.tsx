import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { 
  listUsers, 
  toggleUserRole, 
  toggleUserBlock, 
  resetUserPassword,
  User,
  checkIsSuperAdmin
} from '@/lib/user-management';
import { supabase } from '@/lib/supabase';

export function UserManagement() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});
  const [isSuperAdminFromCheck, setIsSuperAdminFromCheck] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        console.log("Benutzer werden abgerufen...");
        const users = await listUsers();
        console.log("Benutzer empfangen:", users);
        setUsers(users);
        
        console.log("Superadmin-Check wird durchgeführt...");
        const isSuperAdminCheck = await checkIsSuperAdmin();
        console.log("Ist Superadmin:", isSuperAdminCheck);
        setIsSuperAdminFromCheck(isSuperAdminCheck);
      } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        setError(error.message || 'Fehler beim Laden der Benutzerdaten');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleToggleAdmin = async (userId: string) => {
    if (actionInProgress[userId]) return;
    
    console.log('handleToggleAdmin aufgerufen mit userId:', userId);
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      console.log('Rufe toggleUserRole auf...');
      
      try {
        await toggleUserRole(userId, 'admin');
        console.log('toggleUserRole erfolgreich abgeschlossen');
      } catch (toggleError) {
        console.error('Fehler in toggleUserRole, versuche direkten Aufruf:', toggleError);
        
        // Direkter Aufruf als Fallback
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Nicht eingeloggt");
        
        // Direkter Aufruf mit alternativer Aktionsbezeichnung
        console.log('Versuche direkten Aufruf mit toggle-admin');
        const response = await supabase.functions.invoke('manage-users', {
          method: 'POST',
          body: { 
            action: 'toggle-admin',
            targetUserId: userId,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Direkter Aufruf Ergebnis:', response);
        if (response.error) throw response.error;
      }
      
      // Benutzerliste aktualisieren
      console.log('Aktualisiere Benutzerliste...');
      const updatedUsers = await listUsers();
      setUsers(updatedUsers);
      console.log('Benutzerliste aktualisiert');
    } catch (err) {
      console.error('Fehler in handleToggleAdmin:', err);
      setError(typeof err === 'string' ? err : err.message || 'Fehler beim Verwalten der Admin-Rolle');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleToggleSuperAdmin = async (userId: string) => {
    if (!isSuperAdmin || actionInProgress[userId]) return;
    
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      await toggleUserRole(userId, 'superadmin');
      
      // Benutzerliste aktualisieren
      const updatedUsers = await listUsers();
      setUsers(updatedUsers);
    } catch (err) {
      setError(err.message || 'Fehler beim Ändern der SuperAdmin-Rolle');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleToggleBlock = async (userId: string) => {
    if (!isSuperAdmin || actionInProgress[userId]) return;
    
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      const userToToggle = users.find(u => u.id === userId);
      const reason = !userToToggle?.is_blocked ? blockReason : undefined;
      
      await toggleUserBlock(userId, reason);
      setBlockReason('');
      
      // Benutzerliste aktualisieren
      const updatedUsers = await listUsers();
      setUsers(updatedUsers);
    } catch (err) {
      setError(err.message || 'Fehler beim Sperren/Entsperren des Benutzers');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleResetPassword = async (email: string, userId: string) => {
    if (!isSuperAdmin || actionInProgress[userId]) return;
    
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      await resetUserPassword(email);
      alert(`Ein Passwort-Reset-Link wurde an ${email} gesendet.`);
    } catch (err) {
      setError(err.message || 'Fehler beim Zurücksetzen des Passworts');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };

  if (loading) return <div className="p-4">Laden...</div>;
  if (error) return <div className="p-4 text-red-500">Fehler: {error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Benutzerverwaltung</h1>
      
      {users.length === 0 ? (
        <p>Keine Benutzer gefunden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left">E-Mail</th>
                <th className="px-4 py-2 text-left">Erstellt am</th>
                <th className="px-4 py-2 text-left">Letzte Anmeldung</th>
                <th className="px-4 py-2 text-left">Rollen</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((userItem) => (
                <tr key={userItem.id} className={userItem.is_blocked ? "bg-red-50" : ""}>
                  <td className="px-4 py-2">{userItem.email}</td>
                  <td className="px-4 py-2">{new Date(userItem.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {userItem.last_sign_in_at 
                      ? new Date(userItem.last_sign_in_at).toLocaleString() 
                      : 'Nie'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {userItem.roles.map(role => (
                        <span 
                          key={role} 
                          className={`px-2 py-1 rounded text-xs ${
                            role === 'superadmin' 
                              ? 'bg-purple-100 text-purple-800' 
                              : role === 'admin' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100'
                          }`}
                        >
                          {role}
                        </span>
                      ))}
                      {!userItem.roles.length && <span className="text-gray-400">Keine</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {userItem.is_blocked ? (
                      <span className="text-red-600 font-medium">
                        Gesperrt {userItem.block_reason && `(${userItem.block_reason})`}
                      </span>
                    ) : (
                      <span className="text-green-600 font-medium">Aktiv</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleToggleAdmin(userItem.id)}
                        className={`px-3 py-1 text-sm rounded ${
                          userItem.roles.includes('admin')
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                        disabled={actionInProgress[userItem.id]}
                      >
                        {userItem.roles.includes('admin') ? 'Admin entfernen' : 'Als Admin festlegen'}
                      </button>
                      
                      {isSuperAdmin && (
                        <>
                          <button
                            onClick={() => handleToggleSuperAdmin(userItem.id)}
                            className={`px-3 py-1 text-sm rounded ${
                              userItem.roles.includes('superadmin')
                                ? 'bg-purple-500 text-white hover:bg-purple-600'
                                : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                            disabled={actionInProgress[userItem.id]}
                          >
                            {userItem.roles.includes('superadmin') ? 'SuperAdmin entfernen' : 'Als SuperAdmin festlegen'}
                          </button>
                          
                          {!userItem.is_blocked ? (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                placeholder="Grund"
                                className="px-2 py-1 text-sm border rounded flex-grow"
                                value={blockReason}
                                onChange={(e) => setBlockReason(e.target.value)}
                              />
                              <button
                                onClick={() => handleToggleBlock(userItem.id)}
                                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                                disabled={actionInProgress[userItem.id]}
                              >
                                Sperren
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleToggleBlock(userItem.id)}
                              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                              disabled={actionInProgress[userItem.id]}
                            >
                              Entsperren
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleResetPassword(userItem.email, userItem.id)}
                            className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                            disabled={actionInProgress[userItem.id]}
                          >
                            Passwort zurücksetzen
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 