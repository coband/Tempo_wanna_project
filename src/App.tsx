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

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      {/* Tempo routes */}
      {import.meta.env.VITE_TEMPO && useRoutes(routes)}

      <Routes>
        <Route path="/" element={<Home />} />
        {/* Clerk Auth Routen */}
        <Route path="/sign-in/*" element={<SignIn routing="path" path="/sign-in" />} />
        <Route path="/sign-up/*" element={<SignUp routing="path" path="/sign-up" />} />
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
