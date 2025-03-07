import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogOut, Users, BookOpen, Upload } from "lucide-react";

interface DashboardHeaderProps {
  className?: string;
}

export function DashboardHeader({ className = "" }: DashboardHeaderProps) {
  const { signOut, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path ? 'bg-gray-100' : '';
  };

  return (
    <header className={`border-b bg-white ${className}`}>
      <div className="flex h-16 items-center px-4 w-full justify-between">
        <div className="flex items-center">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600 mr-6">
            Wanna
          </h2>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex space-x-2">
            <Link
              to="/dashboard"
              className={`flex items-center px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 ${isActive('/dashboard')}`}
            >
              <BookOpen className="h-5 w-5 mr-2" />
              <span>Bücher</span>
            </Link>
            
            {isAdmin && (
              <>
                <Link
                  to="/admin/users"
                  className={`flex items-center px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 ${isActive('/admin/users')}`}
                >
                  <Users className="h-5 w-5 mr-2" />
                  <span>Benutzerverwaltung</span>
                </Link>
                
                <Link
                  to="/admin/bulk-import"
                  className={`flex items-center px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 ${isActive('/admin/bulk-import')}`}
                >
                  <Upload className="h-5 w-5 mr-2" />
                  <span>Massenimport</span>
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center space-x-2">
          {isAdmin && (
            <div className="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-800 mr-2">
              {isSuperAdmin ? 'SuperAdmin' : 'Admin'}
            </div>
          )}
          
          <button
            type="button"
            onTouchEnd={(e) => {
              e.preventDefault();
              handleSignOut();
            }}
            onClick={(e) => {
              e.preventDefault();
              handleSignOut();
            }}
            className="flex items-center justify-center px-3 py-2 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors min-h-[44px] min-w-[44px] touch-manipulation cursor-pointer select-none"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <LogOut className="h-5 w-5 sm:mr-2" />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        </div>
      </div>
    </header>
  );
}
