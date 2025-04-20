import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { 
  User,
} from '@/lib/user-management';
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
import { DashboardHeader } from '../dashboard/DashboardHeader';
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
  const { supabase } = useSupabaseAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showAdminsOnly, setShowAdminsOnly] = useState(false);
  const [userToAction, setUserToAction] = useState<User | null>(null);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  // Clerk Secret Key Prüfung entfernen - dieser sollte nur serverseitig geprüft werden
  // useEffect(() => {
  //   if (!import.meta.env.VITE_CLERK_SECRET_KEY) {
  //     setError("Clerk Secret Key fehlt. Bitte in den Umgebungsvariablen konfigurieren.");
  //     setLoading(false);
  //   }
  // }, []);

  // Benutzer von Clerk abrufen
  const fetchUsers = async () => {
    try {
      console.log("Benutzer werden von Clerk abgerufen...");
      const { data, error } = await supabase.functions.invoke('clerk-users', {
        body: { action: 'list-users' }
      });
      
      if (error) throw error;
      
      console.log("Benutzer empfangen:", data.users);
      return data.users;
    } catch (error) {
      console.error("Fehler beim Abrufen der Benutzer:", error);
      throw error;
    }
  };
  
  // Admin-Rolle umschalten
  const toggleUserAdmin = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('clerk-users', {
        body: {
          action: 'toggle-role',
          userId,
          role: 'admin'
        }
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Fehler beim Umschalten der Admin-Rolle:", error);
      throw error;
    }
  };
  
  // SuperAdmin-Rolle umschalten
  const toggleUserSuperAdmin = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('clerk-users', {
        body: {
          action: 'toggle-role',
          userId,
          role: 'superadmin'
        }
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Fehler beim Umschalten der SuperAdmin-Rolle:", error);
      throw error;
    }
  };
  
  // Benutzer sperren/entsperren
  const blockUnblockUser = async (userId: string, reason?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('clerk-users', {
        body: {
          action: 'toggle-block',
          userId,
          reason
        }
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Fehler beim Sperren/Entsperren des Benutzers:", error);
      throw error;
    }
  };
  
  // Passwort zurücksetzen
  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('clerk-users', {
        body: {
          action: 'reset-password',
          email
        }
      });
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Fehler beim Zurücksetzen des Passworts:", error);
      throw error;
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null); // Zurücksetzen von Fehlern beim erneuten Laden
      try {
        const users = await fetchUsers();
        setUsers(users);
        setFilteredUsers(users);
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
    
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      
      await toggleUserAdmin(userId);
      
      // Benutzerliste aktualisieren
      const updatedUsers = await fetchUsers();
      setUsers(updatedUsers);
    } catch (err) {
      setError(err.message || 'Fehler beim Verwalten der Admin-Rolle');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleToggleSuperAdmin = async (userId: string) => {
    if (!isSuperAdmin || actionInProgress[userId]) return;
    
    try {
      setActionInProgress(prev => ({ ...prev, [userId]: true }));
      await toggleUserSuperAdmin(userId);
      
      // Benutzerliste aktualisieren
      const updatedUsers = await fetchUsers();
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
      
      await blockUnblockUser(userId, reason);
      setBlockReason('');
      setIsBlockDialogOpen(false);
      
      // Benutzerliste aktualisieren
      const updatedUsers = await fetchUsers();
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
      await resetPassword(email);
      setIsResetDialogOpen(false);
      alert(`Ein Anmelde-Link wurde an ${email} gesendet.`);
    } catch (err) {
      setError(err.message || 'Fehler beim Senden des Anmelde-Links');
    } finally {
      setActionInProgress(prev => ({ ...prev, [userId]: false }));
    }
  };
  
  const refreshUsers = async () => {
    setLoading(true);
    try {
      const updatedUsers = await fetchUsers();
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
    <div className="bg-gray-50 min-h-screen">
      <DashboardHeader />
      <div className="container py-4 px-2 sm:py-6 sm:px-4 max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">
              <UserCircle2 className="inline-block mr-2 h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              Benutzerverwaltung
            </h1>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-grow">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Benutzer suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              
              <Button 
                variant="outline" 
                onClick={refreshUsers}
                className="flex items-center justify-center gap-2 sm:w-auto"
              >
                <RefreshCw className="h-4 w-4" /> Aktualisieren
              </Button>
            </div>
          </div>
          
          <div className="mb-4 sm:mb-6 overflow-x-auto">
            <Tabs 
              defaultValue="all" 
              className="w-full"
              onValueChange={(value) => {
                if (value === 'all') {
                  // Alle Filter zurücksetzen
                  setShowAdminsOnly(false);
                  setShowBlockedOnly(false);
                  // Kein refreshUsers mehr, da unnötig
                } else if (value === 'admins') {
                  setShowAdminsOnly(true);
                  setShowBlockedOnly(false);
                } else if (value === 'blocked') {
                  setShowBlockedOnly(true);
                  setShowAdminsOnly(false);
                }
              }}
            >
              <TabsList className="mb-4 w-full flex justify-between">
                <TabsTrigger value="all" className="flex-1 text-xs sm:text-sm">Alle</TabsTrigger>
                <TabsTrigger value="admins" className="flex-1 text-xs sm:text-sm">
                  Administratoren
                </TabsTrigger>
                <TabsTrigger value="blocked" className="flex-1 text-xs sm:text-sm">
                  Gesperrte
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <div className="flex items-center justify-between mb-2 text-sm text-gray-500">
              <span>{filteredUsers.length} Benutzer gefunden</span>
            </div>
          </div>
        
          {filteredUsers.length === 0 ? (
            <div className="text-center p-4 sm:p-8 bg-gray-50 rounded-lg border border-gray-200">
              <UserCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-800">Keine Benutzer gefunden</h3>
              <p className="text-gray-500 mt-1 text-sm sm:text-base">
                {searchQuery ? `Es wurden keine Benutzer gefunden, die zu "${searchQuery}" passen.` : 
                  "Es wurden keine Benutzer gefunden, die zu den ausgewählten Filtern passen."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 grid-cols-1">
              {filteredUsers.map((userItem) => (
                <Card 
                  key={userItem.id} 
                  className={`overflow-hidden ${userItem.is_blocked ? "border-red-300 bg-red-50" : ""}`}
                >
                  <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="overflow-hidden">
                        <CardTitle className="text-base sm:text-lg font-medium truncate">{userItem.email}</CardTitle>
                        <CardDescription>
                          <div className="flex flex-col xs:flex-row xs:items-center text-xs text-gray-500 mt-1 gap-1 xs:gap-0">
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">Erstellt: {new Date(userItem.created_at).toLocaleDateString()}</span>
                            </div>
                            <Separator orientation="vertical" className="mx-2 h-3 hidden xs:block" />
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">
                                {userItem.last_sign_in_at 
                                  ? `Letzte Anmeldung: ${new Date(userItem.last_sign_in_at).toLocaleDateString()}`
                                  : 'Nie angemeldet'}
                              </span>
                            </div>
                          </div>
                        </CardDescription>
                      </div>
                      
                      <div className="flex gap-1 flex-wrap">
                        {userItem.roles.map(role => (
                          role && (
                            <Badge 
                              key={role}
                              variant={role === 'superadmin' ? 'destructive' : role === 'admin' ? 'default' : 'secondary'}
                              className="whitespace-nowrap text-xs"
                            >
                              {role === 'superadmin' ? (
                                <><ShieldAlert className="h-3 w-3 mr-1" /> SuperAdmin</>
                              ) : role === 'admin' ? (
                                <><Shield className="h-3 w-3 mr-1" /> Admin</>
                              ) : (
                                role
                              )}
                            </Badge>
                          )
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pb-2 px-3 sm:px-6">
                    <div className="flex items-center gap-2 text-sm flex-wrap">
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
                        <span className="text-red-600 text-xs max-w-full truncate">
                          Grund: {userItem.block_reason}
                        </span>
                      )}
                    </div>
                  </CardContent>
                  
                  <CardFooter className="pt-3 flex flex-wrap justify-end gap-2 border-t px-3 sm:px-6 pb-3 sm:pb-6">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={userItem.roles.includes('admin') ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleToggleAdmin(userItem.id)}
                            disabled={actionInProgress[userItem.id]}
                            className="text-xs"
                          >
                            {userItem.roles.includes('admin') ? (
                              <><XCircle className="h-3.5 w-3.5 mr-1" /> Admin entfernen</>
                            ) : (
                              <><CheckCircle className="h-3.5 w-3.5 mr-1" /> Als Admin</>
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
                          <Button variant="outline" size="sm" className="text-xs">
                            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Aktionen
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>SuperAdmin Aktionen</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          
                          <DropdownMenuItem
                            onClick={() => handleToggleSuperAdmin(userItem.id)}
                            disabled={actionInProgress[userItem.id]}
                          >
                            {userItem.roles.includes('superadmin') ? (
                              <><ShieldAlert className="h-3.5 w-3.5 mr-2 text-red-500" /> SuperAdmin entfernen</>
                            ) : (
                              <><ShieldAlert className="h-3.5 w-3.5 mr-2 text-amber-500" /> Als SuperAdmin</>
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
                              <><Unlock className="h-3.5 w-3.5 mr-2" /> Entsperren</>
                            ) : (
                              <><Lock className="h-3.5 w-3.5 mr-2" /> Sperren</>
                            )}
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem
                            onClick={() => {
                              setUserToAction(userItem);
                              setIsResetDialogOpen(true);
                            }}
                            disabled={actionInProgress[userItem.id]}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-2 text-blue-500" /> Anmelde-Link
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
        
        {/* Block Dialog */}
        <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {userToAction?.is_blocked ? 'Benutzer entsperren' : 'Benutzer sperren'}
              </DialogTitle>
              <DialogDescription>
                {userToAction?.is_blocked
                  ? `Möchten Sie den Benutzer "${userToAction.email}" entsperren?`
                  : `Geben Sie einen Grund an, warum Sie den Benutzer "${userToAction?.email}" sperren möchten.`
                }
              </DialogDescription>
            </DialogHeader>
            
            {!userToAction?.is_blocked && (
              <div className="py-4">
                <label htmlFor="block-reason" className="block text-sm font-medium mb-2">
                  Sperrgrund (optional)
                </label>
                <Input
                  id="block-reason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="z.B. Verstöße gegen Nutzungsbedingungen"
                />
              </div>
            )}
            
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button 
                variant={userToAction?.is_blocked ? "default" : "destructive"}
                onClick={() => userToAction && handleToggleBlock(userToAction.id, blockReason)}
              >
                {userToAction?.is_blocked ? 'Entsperren' : 'Sperren'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Reset Password Dialog */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Anmelde-Link senden</DialogTitle>
              <DialogDescription>
                Ein Einmal-Anmelde-Link wird an folgende E-Mail-Adresse gesendet: {userToAction?.email}
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Abbrechen</Button>
              </DialogClose>
              <Button 
                variant="default"
                onClick={() => userToAction && handleResetPassword(userToAction.email, userToAction.id)}
              >
                Link senden
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 