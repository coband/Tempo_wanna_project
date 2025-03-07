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
import { 
  UserCircle2, 
  Shield, 
  ShieldAlert, 
  Calendar, 
  Clock, 
  Lock, 
  Unlock, 
  RotateCcw, 
  CheckCircle, 
  XCircle,
  SearchIcon,
  SlidersHorizontal,
  RefreshCw
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function UserManagement() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});
  const [isSuperAdminFromCheck, setIsSuperAdminFromCheck] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showAdminsOnly, setShowAdminsOnly] = useState(false);
  const [userToAction, setUserToAction] = useState<User | null>(null);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        console.log("Benutzer werden abgerufen...");
        const users = await listUsers();
        console.log("Benutzer empfangen:", users);
        setUsers(users);
        setFilteredUsers(users);
        
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

  // Filter users whenever search or filter criteria change
  useEffect(() => {
    let result = [...users];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(user => 
        user.email.toLowerCase().includes(query)
      );
    }
    
    // Apply blocked filter
    if (showBlockedOnly) {
      result = result.filter(user => user.is_blocked);
    }
    
    // Apply admin filter
    if (showAdminsOnly) {
      result = result.filter(user => 
        user.roles.includes('admin') || user.roles.includes('superadmin')
      );
    }
    
    setFilteredUsers(result);
  }, [users, searchQuery, showBlockedOnly, showAdminsOnly]);

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

  const handleToggleBlock = async (userId: string, reason?: string) => {
    if (!isSuperAdmin || actionInProgress[userId]) return;
    
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      
      await toggleUserBlock(userId, reason);
      setBlockReason('');
      setIsBlockDialogOpen(false);
      
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
      setIsResetDialogOpen(false);
      alert(`Ein Passwort-Reset-Link wurde an ${email} gesendet.`);
    } catch (err) {
      setError(err.message || 'Fehler beim Zurücksetzen des Passworts');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };
  
  const refreshUsers = async () => {
    setLoading(true);
    try {
      const updatedUsers = await listUsers();
      setUsers(updatedUsers);
    } catch (err) {
      setError(err.message || 'Fehler beim Aktualisieren der Benutzerdaten');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-t-blue-500 border-b-gray-200 border-l-gray-200 border-r-gray-200 animate-spin"></div>
          <p className="mt-4 text-gray-600">Benutzer werden geladen...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <Card className="max-w-4xl mx-auto my-8 bg-red-50 border-red-200">
        <CardHeader>
          <CardTitle className="text-red-800">Fehler beim Laden der Benutzerdaten</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-700">{error}</p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={refreshUsers}>
            <RefreshCw className="h-4 w-4 mr-2" /> Erneut versuchen
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="container py-6 px-4 max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4 md:mb-0">
            <UserCircle2 className="inline-block mr-2 h-6 w-6 text-blue-600" />
            Benutzerverwaltung
          </h1>
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Benutzer suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full md:w-64"
              />
            </div>
            
            <Button 
              variant="outline" 
              onClick={refreshUsers}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Aktualisieren
            </Button>
          </div>
        </div>
        
        <div className="mb-6">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="all">Alle Benutzer</TabsTrigger>
              <TabsTrigger value="admins" onClick={() => setShowAdminsOnly(!showAdminsOnly)}>
                Administratoren
              </TabsTrigger>
              <TabsTrigger value="blocked" onClick={() => setShowBlockedOnly(!showBlockedOnly)}>
                Gesperrte Benutzer
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex items-center justify-between mb-2 text-sm text-gray-500">
            <span>{filteredUsers.length} Benutzer gefunden</span>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={showAdminsOnly} 
                  onChange={() => setShowAdminsOnly(!showAdminsOnly)}
                  className="mr-2"
                />
                Nur Administratoren
              </label>
              <label className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={showBlockedOnly} 
                  onChange={() => setShowBlockedOnly(!showBlockedOnly)}
                  className="mr-2"
                />
                Nur gesperrte Benutzer
              </label>
            </div>
          </div>
        </div>
      
        {filteredUsers.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
            <UserCircle2 className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-800">Keine Benutzer gefunden</h3>
            <p className="text-gray-500 mt-1">
              {searchQuery ? `Es wurden keine Benutzer gefunden, die zu "${searchQuery}" passen.` : 
                "Es wurden keine Benutzer gefunden, die zu den ausgewählten Filtern passen."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {filteredUsers.map((userItem) => (
              <Card 
                key={userItem.id} 
                className={`overflow-hidden ${userItem.is_blocked ? "border-red-300 bg-red-50" : ""}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-medium">{userItem.email}</CardTitle>
                      <CardDescription>
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                          <Calendar className="h-3 w-3 mr-1" />
                          <span>Erstellt: {new Date(userItem.created_at).toLocaleDateString()}</span>
                          <Separator orientation="vertical" className="mx-2 h-3" />
                          <Clock className="h-3 w-3 mr-1" />
                          <span>
                            {userItem.last_sign_in_at 
                              ? `Letzte Anmeldung: ${new Date(userItem.last_sign_in_at).toLocaleDateString()}`
                              : 'Nie angemeldet'}
                          </span>
                        </div>
                      </CardDescription>
                    </div>
                    
                    <div className="flex gap-1">
                      {userItem.roles.map(role => (
                        <Badge 
                          key={role}
                          variant={role === 'superadmin' ? 'destructive' : role === 'admin' ? 'default' : 'secondary'}
                        >
                          {role === 'superadmin' ? (
                            <><ShieldAlert className="h-3 w-3 mr-1" /> SuperAdmin</>
                          ) : role === 'admin' ? (
                            <><Shield className="h-3 w-3 mr-1" /> Admin</>
                          ) : (
                            role
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge 
                      variant={userItem.is_blocked ? "destructive" : "default"}
                      className={`rounded-full px-3 ${!userItem.is_blocked ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}`}
                    >
                      {userItem.is_blocked ? (
                        <><Lock className="h-3 w-3 mr-1" /> Gesperrt</>
                      ) : (
                        <><Unlock className="h-3 w-3 mr-1" /> Aktiv</>
                      )}
                    </Badge>
                    
                    {userItem.is_blocked && userItem.block_reason && (
                      <span className="text-red-600 text-xs">
                        Grund: {userItem.block_reason}
                      </span>
                    )}
                  </div>
                </CardContent>
                
                <CardFooter className="pt-3 flex flex-wrap justify-end gap-2 border-t">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={userItem.roles.includes('admin') ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleAdmin(userItem.id)}
                          disabled={actionInProgress[userItem.id]}
                        >
                          {userItem.roles.includes('admin') ? (
                            <><XCircle className="h-3.5 w-3.5 mr-1" /> Admin entfernen</>
                          ) : (
                            <><CheckCircle className="h-3.5 w-3.5 mr-1" /> Als Admin festlegen</>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{userItem.roles.includes('admin') ? 'Admin-Berechtigungen entfernen' : 'Admin-Berechtigungen gewähren'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {isSuperAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Erweiterte Aktionen
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>SuperAdmin Aktionen</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        
                        <DropdownMenuItem
                          onClick={() => handleToggleSuperAdmin(userItem.id)}
                          disabled={actionInProgress[userItem.id]}
                          className={userItem.roles.includes('superadmin') ? "text-red-600" : ""}
                        >
                          {userItem.roles.includes('superadmin') ? (
                            <><ShieldAlert className="h-3.5 w-3.5 mr-2" /> SuperAdmin entfernen</>
                          ) : (
                            <><ShieldAlert className="h-3.5 w-3.5 mr-2" /> Als SuperAdmin festlegen</>
                          )}
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem
                          onClick={() => {
                            setUserToAction(userItem);
                            setIsBlockDialogOpen(true);
                          }}
                          disabled={actionInProgress[userItem.id]}
                          className={userItem.is_blocked ? "text-green-600" : "text-red-600"}
                        >
                          {userItem.is_blocked ? (
                            <><Unlock className="h-3.5 w-3.5 mr-2" /> Benutzer entsperren</>
                          ) : (
                            <><Lock className="h-3.5 w-3.5 mr-2" /> Benutzer sperren</>
                          )}
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem
                          onClick={() => {
                            setUserToAction(userItem);
                            setIsResetDialogOpen(true);
                          }}
                          disabled={actionInProgress[userItem.id]}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-2" /> Passwort zurücksetzen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* Block User Dialog */}
      <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {userToAction?.is_blocked 
                ? `Benutzer ${userToAction?.email} entsperren?` 
                : `Benutzer ${userToAction?.email} sperren?`}
            </DialogTitle>
            <DialogDescription>
              {userToAction?.is_blocked 
                ? "Der Benutzer kann sich nach dem Entsperren wieder anmelden."
                : "Der Benutzer kann sich nach dem Sperren nicht mehr anmelden."}
            </DialogDescription>
          </DialogHeader>
          
          {!userToAction?.is_blocked && (
            <div className="my-4">
              <label className="text-sm font-medium mb-2 block">Grund für die Sperrung (optional)</label>
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="z.B. Richtlinienverstoß"
              />
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsBlockDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button 
              variant={userToAction?.is_blocked ? "default" : "destructive"}
              onClick={() => userToAction && handleToggleBlock(userToAction.id, blockReason)}
            >
              {userToAction?.is_blocked ? "Entsperren" : "Sperren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Reset Password Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passwort zurücksetzen</DialogTitle>
            <DialogDescription>
              Ein Passwort-Reset-Link wird an {userToAction?.email} gesendet.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsResetDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button 
              onClick={() => userToAction && handleResetPassword(userToAction.email, userToAction.id)}
            >
              Reset-Link senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 