import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LogOut, Users, BookOpen, Upload, Menu, X } from "lucide-react";
import { UserButton } from "@clerk/clerk-react";
import { useState } from "react";

interface DashboardHeaderProps {
  className?: string;
}

export function DashboardHeader({ className = "" }: DashboardHeaderProps) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path ? 'bg-gray-100' : '';
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const navLinks = (
    <>
      <Link
        to="/dashboard"
        className={`flex items-center px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 ${isActive('/dashboard')}`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <BookOpen className="h-5 w-5 mr-2" />
        <span>Bücher</span>
      </Link>
      
      {/* Benutzerverwaltung nur für Superadmins */}
      {isSuperAdmin && (
        <Link
          to="/admin/users"
          className={`flex items-center px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 ${isActive('/admin/users')}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          <Users className="h-5 w-5 mr-2" />
          <span>Benutzerverwaltung</span>
        </Link>
      )}
      
      {/* Massenimport für alle Admins (inklusive Superadmins) */}
      {isAdmin && (
        <Link
          to="/admin/bulk-import"
          className={`flex items-center px-3 py-2 rounded-md hover:bg-gray-100 text-gray-700 ${isActive('/admin/bulk-import')}`}
          onClick={() => setMobileMenuOpen(false)}
        >
          <Upload className="h-5 w-5 mr-2" />
          <span>Massenimport</span>
        </Link>
      )}
    </>
  );

  return (
    <header className={`border-b bg-white ${className}`}>
      <div className="flex h-16 items-center px-4 w-full justify-between">
        <div className="flex items-center">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600 mr-6">
            Wanna
          </h2>
          
          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex space-x-2">
            {navLinks}
          </nav>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden flex items-center text-gray-700 ml-2" 
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <div className="flex items-center space-x-4">
          {isAdmin && (
            <div className="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
              {isSuperAdmin ? 'SuperAdmin' : 'Admin'}
            </div>
          )}
          
          {/* Clerk UserButton */}
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200">
          <nav className="flex flex-col space-y-1 p-4 bg-white">
            {navLinks}
          </nav>
        </div>
      )}
    </header>
  );
}
