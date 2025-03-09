import { Suspense } from "react";
import { Routes, Route, useRoutes } from "react-router-dom";
import Home from "./components/home";
import BookManagement from "./components/dashboard/BookManagement";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { UserManagement } from "./components/admin/UserManagement";
import BulkImportBooks from "./components/admin/BulkImportBooks";
import routes from "tempo-routes";
import { useAuth } from "./lib/auth";
import { SignIn, SignUp } from "@clerk/clerk-react";

// Komponente für die Prüfung von Admin- und Superadmin-Rechten
const AdminRoute = ({ children, requireSuperAdmin = false }: { children: React.ReactNode, requireSuperAdmin?: boolean }) => {
  const { isAdmin, isSuperAdmin, loading } = useAuth();
  
  // Prüfen, ob der Benutzer die erforderlichen Rechte hat
  const hasRequiredPermissions = requireSuperAdmin ? isSuperAdmin : isAdmin;
  
  if (loading) {
    return <div className="p-4">Lade...</div>;
  }
  
  if (!hasRequiredPermissions) {
    return <div className="p-4">Sie haben keine Berechtigung, diese Seite anzuzeigen.</div>;
  }
  
  return <ProtectedRoute>{children}</ProtectedRoute>;
};

// Zentrierte Anmeldekomponente
const CenteredSignIn = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <SignIn routing="path" path="/sign-in" />
      </div>
    </div>
  );
};

// Zentrierte Registrierungskomponente
const CenteredSignUp = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <SignUp routing="path" path="/sign-up" />
      </div>
    </div>
  );
};

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      {/* Tempo routes */}
      {import.meta.env.VITE_TEMPO && useRoutes(routes)}

      <Routes>
        <Route path="/" element={<Home />} />
        {/* Clerk Auth Routen mit zentrierten Komponenten */}
        <Route path="/sign-in/*" element={<CenteredSignIn />} />
        <Route path="/sign-up/*" element={<CenteredSignUp />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <BookManagement />
            </ProtectedRoute>
          }
        />
        {/* Admin-Routen */}
        <Route
          path="/admin/users"
          element={
            <AdminRoute requireSuperAdmin={true}>
              <UserManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/bulk-import"
          element={
            <AdminRoute>
              <BulkImportBooks />
            </AdminRoute>
          }
        />
        {/* Add this before any catchall route */}
        {import.meta.env.VITE_TEMPO && <Route path="/tempobook/*" />}
      </Routes>
    </Suspense>
  );
}

export default App;
